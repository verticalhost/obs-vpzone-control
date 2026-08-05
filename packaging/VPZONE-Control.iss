#define AppName "VPZONE Control"
#define AppVersion "1.1.0"
#define AppPublisher "Solutions Techno-Redac Inc."
#define AppURL "https://github.com/verticalhost/obs-vpzone-control"

[Setup]
AppId={{1CB0B8C4-2B25-47B9-A702-36583DE214B8}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}/issues
DefaultDirName={localappdata}\Programs\VPZONE Control
DefaultGroupName=VPZONE Control
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
CloseApplicationsFilter=obs64.exe
OutputDir=..\release
OutputBaseFilename=VPZONE-Control-Setup-v{#AppVersion}-Windows-x64
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=VPZONE Control for OBS

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Files]
Source: "..\release\VPZONE-Control-Windows-x64\VPZONE-Control.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "launch-hidden.vbs"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\VPZONE Control"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\launch-hidden.vbs"""
Name: "{userstartup}\VPZONE Control"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\launch-hidden.vbs"""; WorkingDir: "{app}"

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\launch-hidden.vbs"""; WorkingDir: "{app}"; Flags: nowait runhidden
Filename: "{code:GetOBSPath}"; Description: "Launch OBS Studio"; Flags: postinstall nowait skipifsilent; Check: OBSInstalled

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/IM VPZONE-Control.exe /F"; Flags: runhidden; RunOnceId: "StopVPZONEControl"

[Code]
const
  DockEntry = '{"title":"VPZONE Control","url":"http://127.0.0.1:4876","uuid":"1cb0b8c42b2547b9a70236583de214b8"}';

function OBSConfigPath: String;
begin
  Result := ExpandConstant('{userappdata}\obs-studio\global.ini');
end;

function GetOBSPath(Param: String): String;
begin
  Result := ExpandConstant('{autopf}\obs-studio\bin\64bit\obs64.exe');
end;

function OBSInstalled: Boolean;
begin
  Result := FileExists(GetOBSPath(''));
end;

procedure RegisterOBSDock;
var
  ConfigPath, Current, Updated: String;
begin
  ConfigPath := OBSConfigPath;
  ForceDirectories(ExtractFileDir(ConfigPath));
  if FileExists(ConfigPath) and not FileExists(ConfigPath + '.vpzone-backup') then
    CopyFile(ConfigPath, ConfigPath + '.vpzone-backup', False);

  Current := GetIniString('BasicWindow', 'ExtraBrowserDocks', '[]', ConfigPath);
  if Pos('"uuid":"1cb0b8c42b2547b9a70236583de214b8"', Current) > 0 then
    Exit;

  if (Current = '') or (Current = '[]') then
    Updated := '[' + DockEntry + ']'
  else if Current[Length(Current)] = ']' then
    Updated := Copy(Current, 1, Length(Current) - 1) + ',' + DockEntry + ']'
  else
    Updated := '[' + DockEntry + ']';

  SetIniString('BasicWindow', 'ExtraBrowserDocks', Updated, ConfigPath);
end;

procedure RemoveOBSDock;
var
  ConfigPath, Current, Updated: String;
begin
  ConfigPath := OBSConfigPath;
  if not FileExists(ConfigPath) then Exit;
  Current := GetIniString('BasicWindow', 'ExtraBrowserDocks', '[]', ConfigPath);
  Updated := Current;
  StringChangeEx(Updated, ',' + DockEntry, '', True);
  StringChangeEx(Updated, DockEntry + ',', '', True);
  StringChangeEx(Updated, DockEntry, '', True);
  if Updated = '' then Updated := '[]';
  SetIniString('BasicWindow', 'ExtraBrowserDocks', Updated, ConfigPath);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then RegisterOBSDock;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then RemoveOBSDock;
end;
