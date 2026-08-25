Option Explicit

Const SERVER_URL = "https://localhost:5173/"
Const STARTUP_TIMEOUT_SECONDS = 30

Dim shell, fso, projectRoot, runner, startedAt
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Keep the launcher portable if the AI HUB folder is moved.
projectRoot = fso.GetParentFolderName(WScript.ScriptFullName)
runner = projectRoot & "\run-vite-dev.cmd"

' Run Vite hidden, then wait for it to accept HTTPS requests before opening it.
shell.Run """" & runner & """", 0, False
startedAt = Timer

Do While ElapsedSeconds(startedAt) < STARTUP_TIMEOUT_SECONDS
    If ServerIsReady(SERVER_URL) Then
        shell.Run SERVER_URL, 1, False
        WScript.Quit 0
    End If
    WScript.Sleep 500
Loop

MsgBox "AI HUB 서버를 시작하지 못했습니다. vite-dev.err.log 파일을 확인해 주세요.", vbExclamation, "AI HUB"
WScript.Quit 1

Function ServerIsReady(url)
    Dim request
    On Error Resume Next
    Set request = CreateObject("WinHttp.WinHttpRequest.5.1")
    request.SetTimeouts 1000, 1000, 1000, 1000
    request.Open "GET", url, False
    ' Vite uses a local self-signed certificate in development.
    request.Option(4) = 13056
    request.Send
    ServerIsReady = (Err.Number = 0 And request.Status >= 200 And request.Status < 500)
    Err.Clear
    On Error GoTo 0
End Function

Function ElapsedSeconds(startedAt)
    ElapsedSeconds = Timer - startedAt
    If ElapsedSeconds < 0 Then ElapsedSeconds = ElapsedSeconds + 86400
End Function
