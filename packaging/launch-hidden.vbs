Set Shell = CreateObject("WScript.Shell")
Set Files = CreateObject("Scripting.FileSystemObject")
Folder = Files.GetParentFolderName(WScript.ScriptFullName)
Shell.Run Chr(34) & Folder & "\VPZONE-Control.exe" & Chr(34), 0, False
