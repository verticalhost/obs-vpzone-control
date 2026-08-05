#define AppName "VPZONE Control for OBS"
#define AppVersion "2.0.0"
#define AppPublisher "Solutions Techno-Redac Inc."
#define AppURL "https://github.com/verticalhost/obs-vpzone-control"

[Setup]
AppId={{1CB0B8C4-2B25-47B9-A702-36583DE214B8}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}/issues
DefaultDirName={autopf}\obs-studio
UsePreviousAppDir=no
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=force
RestartApplications=no
CloseApplicationsFilter=obs64.exe
OutputDir=..\release
OutputBaseFilename=VPZONE-Control-Setup-v{#AppVersion}-Windows-x64
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=VPZONE Control for OBS
UninstallFilesDir={autopf}\obs-studio\uninstallers\obs-vpzone-control

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Files]
Source: "..\release\obs-vpzone-control\bin\64bit\obs-vpzone-control.dll"; DestDir: "{app}\obs-plugins\64bit"; Flags: ignoreversion
Source: "..\release\obs-vpzone-control\data\VPZONE-Control.exe"; DestDir: "{app}\data\obs-plugins\obs-vpzone-control"; Flags: ignoreversion

[InstallDelete]
Type: files; Name: "{localappdata}\Programs\VPZONE Control\VPZONE-Control.exe"
Type: files; Name: "{localappdata}\Programs\VPZONE Control\launch-hidden.vbs"
Type: files; Name: "{userstartup}\VPZONE Control.lnk"
Type: filesandordirs; Name: "{userappdata}\obs-studio\plugins\obs-vpzone-control"

[Run]
Filename: "{code:GetOBSPath}"; Description: "Launch OBS Studio"; Flags: postinstall nowait skipifsilent; Check: OBSInstalled

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/IM VPZONE-Control.exe /F"; Flags: runhidden; RunOnceId: "StopVPZONEControl"

[Code]
const
  LegacyDockUuid = '1cb0b8c42b2547b9a70236583de214b8';

function OBSConfigPath: String;
begin
  Result := ExpandConstant('{userappdata}\obs-studio\user.ini');
end;

function GetOBSPath(Param: String): String;
begin
  Result := ExpandConstant('{autopf}\obs-studio\bin\64bit\obs64.exe');
end;

function OBSInstalled: Boolean;
begin
  Result := FileExists(GetOBSPath(''));
end;

procedure RemoveLegacyBrowserDock;
var
  ConfigPath, Current, Updated: String;
  MarkerPos, StartPos, EndPos: Integer;
begin
  ConfigPath := OBSConfigPath;
  if not FileExists(ConfigPath) then Exit;

  Current := GetIniString('BasicWindow', 'ExtraBrowserDocks', '[]', ConfigPath);
  Updated := Current;
  MarkerPos := Pos(LegacyDockUuid, Updated);
  while MarkerPos > 0 do begin
    StartPos := MarkerPos;
    while (StartPos > 1) and (Updated[StartPos] <> '{') do
      StartPos := StartPos - 1;

    EndPos := MarkerPos;
    while (EndPos <= Length(Updated)) and (Updated[EndPos] <> '}') do
      EndPos := EndPos + 1;

    if (Updated[StartPos] <> '{') or (EndPos > Length(Updated)) then Break;

    if (StartPos > 1) and (Updated[StartPos - 1] = ',') then
      StartPos := StartPos - 1
    else if (EndPos < Length(Updated)) and (Updated[EndPos + 1] = ',') then
      EndPos := EndPos + 1;

    Delete(Updated, StartPos, EndPos - StartPos + 1);
    MarkerPos := Pos(LegacyDockUuid, Updated);
  end;
  StringChangeEx(Updated, ', ]', ']', True);
  StringChangeEx(Updated, ',]', ']', True);
  if Updated = '' then Updated := '[]';
  SetIniString('BasicWindow', 'ExtraBrowserDocks', Updated, ConfigPath);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then RemoveLegacyBrowserDock;
end;
