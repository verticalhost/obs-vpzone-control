/*
 * VPZONE Control for OBS
 * Copyright (C) 2026 Solutions Techno-Redac Inc.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

#include <obs-module.h>
#include <obs-frontend-api.h>

#include "browser-panel.hpp"
#include "plugin-support.h"

#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLabel>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QPointer>
#include <QTimer>
#include <QUrl>
#include <QVBoxLayout>
#include <QWidget>

#include <array>
#include <string>
#include <vector>

#ifdef _WIN32
#include <Windows.h>
#endif

OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE(PLUGIN_NAME, "en-US")

namespace {
struct DockSpec {
	const char *id;
	const char *title;
	const char *route;
};

/* The control dock keeps its 2.0.0 identifier so upgrading users keep their layout. */
constexpr std::array<DockSpec, 3> Docks{{
	{"vpzone-control", "VPZONE Control", "/?dock=control"},
	{"vpzone-chat", "VPZONE Chat", "/?dock=chat"},
	{"vpzone-alerts", "VPZONE Alerts", "/?dock=alerts"},
}};

constexpr auto ServiceOrigin = "http://127.0.0.1:4876";
constexpr auto ApplyCommand = "vpzone:apply-stream";

std::vector<QWidget *> dock_widgets;
QPointer<QCefWidget> control_browser;
QCef *cef = nullptr;
QNetworkAccessManager *network = nullptr;
bool docks_requested = false;

#ifdef _WIN32
PROCESS_INFORMATION service_process{};
HANDLE service_job = nullptr;

/* Tying the service to a job object is what actually guarantees it dies with OBS.
 * Terminating it from obs_module_unload only covers an orderly shutdown, and a crashed
 * or force-killed OBS leaves the service holding the port, which then makes the next
 * session's service lose the bind race. */
HANDLE create_kill_on_close_job()
{
	HANDLE job = CreateJobObjectW(nullptr, nullptr);
	if (!job)
		return nullptr;

	JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
	limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
	if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) {
		CloseHandle(job);
		return nullptr;
	}
	return job;
}

void start_service()
{
	char *module_file = obs_module_file("VPZONE-Control.exe");
	if (!module_file)
		return;

	const QString executable = QString::fromUtf8(module_file);
	bfree(module_file);
	if (!QFileInfo::exists(executable)) {
		obs_log(LOG_ERROR, "VPZONE service executable is missing");
		return;
	}

	std::wstring command = L"\"" + executable.toStdWString() + L"\"";
	std::vector<wchar_t> mutable_command(command.begin(), command.end());
	mutable_command.push_back(L'\0');

	if (!service_job)
		service_job = create_kill_on_close_job();

	STARTUPINFOW startup{};
	startup.cb = sizeof(startup);
	const std::wstring directory = QFileInfo(executable).absolutePath().toStdWString();
	/* Suspended so the job is in place before the service can outlive us. */
	if (!CreateProcessW(nullptr, mutable_command.data(), nullptr, nullptr, FALSE,
			    CREATE_NO_WINDOW | CREATE_SUSPENDED, nullptr, directory.c_str(), &startup,
			    &service_process)) {
		obs_log(LOG_ERROR, "Unable to start VPZONE service (Windows error %lu)", GetLastError());
		return;
	}

	if (service_job && !AssignProcessToJobObject(service_job, service_process.hProcess))
		obs_log(LOG_WARNING, "VPZONE service is not bound to OBS (Windows error %lu); it may outlive a crash",
			GetLastError());

	ResumeThread(service_process.hThread);
	CloseHandle(service_process.hThread);
	service_process.hThread = nullptr;
	obs_log(LOG_INFO, "VPZONE service started");
}

void stop_service()
{
	if (service_process.hProcess) {
		if (WaitForSingleObject(service_process.hProcess, 0) == WAIT_TIMEOUT)
			TerminateProcess(service_process.hProcess, 0);
		CloseHandle(service_process.hProcess);
		service_process = {};
	}
	if (service_job) {
		CloseHandle(service_job);
		service_job = nullptr;
	}
}
#else
void start_service() {}
void stop_service() {}
#endif

/* The service writes a fresh token every time it starts, so it is always read on demand. */
QString runtime_token()
{
	QString runtime_path = qEnvironmentVariable("VPZONE_RUNTIME_FILE");
	if (runtime_path.isEmpty()) {
		const QString app_data = qEnvironmentVariable("APPDATA");
		if (app_data.isEmpty())
			return {};
		runtime_path = app_data + QStringLiteral("/VPZONE Control/runtime.json");
	}

	QFile file(runtime_path);
	if (!file.open(QIODevice::ReadOnly))
		return {};
	return QJsonDocument::fromJson(file.readAll()).object().value("localToken").toString();
}

void report(const char *status, const QString &code)
{
	if (!control_browser)
		return;

	const QJsonObject detail{{"status", QString::fromUtf8(status)}, {"code", code}};
	const QString payload = QString::fromUtf8(QJsonDocument(detail).toJson(QJsonDocument::Compact));
	control_browser->executeJavaScript(
		QStringLiteral("window.dispatchEvent(new CustomEvent('vpzone-stream-result',{detail:%1}))")
			.arg(payload)
			.toStdString());
}

/* A fresh rtmp_custom service is created rather than patching the current one: writing
 * server and key into an rtmp_common preset such as Twitch does not yield a custom ingest. */
void apply_stream_settings(const QString &ingest_url, const QString &stream_key)
{
	if (obs_frontend_streaming_active()) {
		report("error", QStringLiteral("streaming_active"));
		return;
	}

	obs_data_t *settings = obs_data_create();
	obs_data_set_string(settings, "server", ingest_url.toUtf8().constData());
	obs_data_set_string(settings, "key", stream_key.toUtf8().constData());

	obs_service_t *service = obs_service_create("rtmp_custom", "VPZONE", settings, nullptr);
	obs_data_release(settings);
	if (!service) {
		obs_log(LOG_ERROR, "Unable to create the VPZONE streaming service");
		report("error", QStringLiteral("service_create_failed"));
		return;
	}

	obs_frontend_set_streaming_service(service);
	obs_frontend_save_streaming_service();
	obs_service_release(service);

	/* The stream key is never logged. */
	obs_log(LOG_INFO, "Streaming service configured for VPZONE (%s)", qUtf8Printable(QUrl(ingest_url).host()));
	report("applied", QString());
}

void fetch_and_apply()
{
	if (obs_frontend_streaming_active()) {
		report("error", QStringLiteral("streaming_active"));
		return;
	}

	const QString token = runtime_token();
	if (token.isEmpty()) {
		obs_log(LOG_ERROR, "VPZONE service runtime token is unavailable");
		report("error", QStringLiteral("service_unavailable"));
		return;
	}

	QNetworkRequest request{QUrl(QString::fromUtf8(ServiceOrigin) + QStringLiteral("/api/stream-key"))};
	request.setRawHeader("X-VPZONE-Local", token.toUtf8());

	QNetworkReply *reply = network->get(request);
	QObject::connect(reply, &QNetworkReply::finished, reply, [reply]() {
		reply->deleteLater();
		const QJsonObject body = QJsonDocument::fromJson(reply->readAll()).object();

		if (reply->error() != QNetworkReply::NoError) {
			const QString code = body.value("code").toString();
			obs_log(LOG_ERROR, "VPZONE stream key request failed: %s",
				qUtf8Printable(code.isEmpty() ? reply->errorString() : code));
			report("error", code.isEmpty() ? QStringLiteral("request_failed") : code);
			return;
		}

		const QString ingest_url = body.value("ingest_url").toString();
		const QString stream_key = body.value("stream_key").toString();
		if (ingest_url.isEmpty() || stream_key.isEmpty()) {
			report("error", QStringLiteral("stream_key_unavailable"));
			return;
		}
		apply_stream_settings(ingest_url, stream_key);
	});
}

void handle_dock_title(const QString &title)
{
	if (title == QLatin1String(ApplyCommand))
		fetch_and_apply();
}

void create_docks()
{
	/* Guarding on dock_widgets alone is not enough: the startup timer and the frontend
	 * event can both arrive while the first call is still blocked waiting for the
	 * browser, which would start the service twice. */
	if (docks_requested)
		return;
	docks_requested = true;
	obs_log(LOG_INFO, "Creating native VPZONE docks");

	start_service();
	cef = obs_browser_init_panel();
	const bool browser_ready = cef && cef->wait_for_browser_init();
	if (!browser_ready)
		obs_log(LOG_ERROR, "OBS Browser is unavailable; VPZONE docks will show a notice");

	for (const DockSpec &spec : Docks) {
		auto *widget = new QWidget();
		widget->setObjectName(QString::fromUtf8(spec.id));
		auto *layout = new QVBoxLayout(widget);
		layout->setContentsMargins(0, 0, 0, 0);

		QCefWidget *browser =
			browser_ready ? cef->create_widget(widget, std::string(ServiceOrigin) + spec.route, nullptr)
				      : nullptr;
		if (browser) {
			browser->allowAllPopups(true);
			layout->addWidget(browser);
			QObject::connect(browser, &QCefWidget::titleChanged, widget, handle_dock_title);
			if (QLatin1String(spec.id) == QLatin1String("vpzone-control"))
				control_browser = browser;
		} else {
			auto *notice =
				new QLabel(QStringLiteral("OBS Browser is required for VPZONE Control."), widget);
			notice->setAlignment(Qt::AlignCenter);
			layout->addWidget(notice);
		}

		if (!obs_frontend_add_dock_by_id(spec.id, spec.title, widget)) {
			obs_log(LOG_ERROR, "Unable to register the %s dock", spec.id);
			delete widget;
			continue;
		}
		dock_widgets.push_back(widget);
	}
}

void frontend_event(enum obs_frontend_event event, void *)
{
	if (event == OBS_FRONTEND_EVENT_FINISHED_LOADING)
		create_docks();
}

/* Fallback path for builds where the dock title bridge does not reach the plugin. */
void tools_menu_clicked(void *)
{
	fetch_and_apply();
}
} // namespace

bool obs_module_load(void)
{
	network = new QNetworkAccessManager();
	obs_frontend_add_event_callback(frontend_event, nullptr);
	obs_frontend_add_tools_menu_item("Configure VPZONE streaming", tools_menu_clicked, nullptr);
	obs_log(LOG_INFO, "VPZONE Control native plugin loaded (version %s)", PLUGIN_VERSION);
	auto *main_window = static_cast<QWidget *>(obs_frontend_get_main_window());
	QTimer::singleShot(1000, main_window, [] { create_docks(); });
	return true;
}

void obs_module_unload(void)
{
	obs_frontend_remove_event_callback(frontend_event, nullptr);
	for (const DockSpec &spec : Docks)
		obs_frontend_remove_dock(spec.id);
	dock_widgets.clear();
	control_browser = nullptr;
	docks_requested = false;
	stop_service();
	delete network;
	network = nullptr;
	obs_log(LOG_INFO, "VPZONE Control native plugin unloaded");
}
