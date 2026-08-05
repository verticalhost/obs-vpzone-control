/*
 * VPZONE Control for OBS
 * Copyright (C) 2026 Solutions Techno-Redac Inc.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

#include <obs-module.h>
#include <obs-frontend-api.h>

#include "browser-panel.hpp"
#include "plugin-support.h"

#include <QFileInfo>
#include <QLabel>
#include <QTimer>
#include <QVBoxLayout>
#include <QWidget>

#include <vector>

#ifdef _WIN32
#include <Windows.h>
#endif

OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE(PLUGIN_NAME, "en-US")

namespace {
constexpr auto DockId = "vpzone-control";
constexpr auto DockTitle = "VPZONE Control";
constexpr auto DockUrl = "http://127.0.0.1:4876";

QWidget *dock_widget = nullptr;
QCef *cef = nullptr;

#ifdef _WIN32
PROCESS_INFORMATION service_process{};

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

	STARTUPINFOW startup{};
	startup.cb = sizeof(startup);
	const std::wstring directory = QFileInfo(executable).absolutePath().toStdWString();
	if (!CreateProcessW(nullptr, mutable_command.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW, nullptr,
			   directory.c_str(), &startup, &service_process)) {
		obs_log(LOG_ERROR, "Unable to start VPZONE service (Windows error %lu)", GetLastError());
		return;
	}
	CloseHandle(service_process.hThread);
}

void stop_service()
{
	if (!service_process.hProcess)
		return;
	if (WaitForSingleObject(service_process.hProcess, 0) == WAIT_TIMEOUT)
		TerminateProcess(service_process.hProcess, 0);
	CloseHandle(service_process.hProcess);
	service_process = {};
}
#else
void start_service() {}
void stop_service() {}
#endif

void create_dock()
{
	if (dock_widget)
		return;

	start_service();
	dock_widget = new QWidget();
	dock_widget->setObjectName(QStringLiteral("VPZONEControlDock"));
	auto *layout = new QVBoxLayout(dock_widget);
	layout->setContentsMargins(0, 0, 0, 0);

	cef = obs_browser_init_panel();
	if (!cef || !cef->wait_for_browser_init()) {
		auto *error = new QLabel(QStringLiteral("OBS Browser is required for VPZONE Control."), dock_widget);
		error->setAlignment(Qt::AlignCenter);
		layout->addWidget(error);
	} else {
		auto *browser = cef->create_widget(dock_widget, DockUrl, nullptr);
		if (browser) {
			browser->allowAllPopups(true);
			layout->addWidget(browser);
		} else {
			layout->addWidget(new QLabel(QStringLiteral("Unable to initialize VPZONE Control."), dock_widget));
		}
	}

	if (!obs_frontend_add_dock_by_id(DockId, DockTitle, dock_widget)) {
		obs_log(LOG_ERROR, "Unable to register the VPZONE Control dock");
		delete dock_widget;
		dock_widget = nullptr;
	}
}

void frontend_event(enum obs_frontend_event event, void *)
{
	if (event == OBS_FRONTEND_EVENT_FINISHED_LOADING)
		create_dock();
}
} // namespace

bool obs_module_load(void)
{
	obs_frontend_add_event_callback(frontend_event, nullptr);
	obs_log(LOG_INFO, "VPZONE Control native plugin loaded (version %s)", PLUGIN_VERSION);
	QTimer::singleShot(1000, [] { create_dock(); });
	return true;
}

void obs_module_unload(void)
{
	obs_frontend_remove_event_callback(frontend_event, nullptr);
	if (dock_widget) {
		obs_frontend_remove_dock(DockId);
		dock_widget = nullptr;
	}
	stop_service();
	obs_log(LOG_INFO, "VPZONE Control native plugin unloaded");
}
