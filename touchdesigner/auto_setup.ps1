Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Start TouchDesigner
Start-Process "C:\Program Files\Derivative\TouchDesigner\bin\TouchDesigner.exe"
Write-Host "Waiting for TouchDesigner to load (15 seconds)..."
Start-Sleep -Seconds 15

# The Python script to execute
$script = @"
vf = 'C:/dance-show/assets/videos/'
m1 = op('/').create(moviefileinTOP, 'movie1')
m1.par.file = vf + 'scene1_joy.mp4'
m1.par.loop = True
print('[OK] movie1 created')
m2 = op('/').create(moviefileinTOP, 'movie2')
m2.par.file = vf + 'scene1_sorrow.mp4'
m2.par.loop = True
print('[OK] movie2 created')
osc = op('/').create(oscinDAT, 'OSC_In_DAT1')
osc.par.port = 3333
print('[OK] OSC created')
sw = op('/').create(switchTOP, 'switch1')
sw.inputConnectors[0].connect(m1.outputConnectors[0])
sw.inputConnectors[0].connect(m2.outputConnectors[0])
sw.par.index = 0
print('[OK] Switch created')
n = op('/').create(nullTOP, 'output')
n.inputConnectors[0].connect(sw.outputConnectors[0])
print('[OK] Output created')
print('SETUP COMPLETE')
"@

# Copy script to clipboard
[System.Windows.Forms.Clipboard]::SetText($script)
Write-Host "Script copied to clipboard"

# Focus TouchDesigner
$proc = Get-Process TouchDesigner -ErrorAction SilentlyContinue
if ($proc) {
    [System.Windows.Forms.SendKeys]::SendWait("%{TAB}")
    Start-Sleep -Milliseconds 500
    
    # Open textport with Alt+D, then T for Dialogs > Textport
    # Or try F1 which sometimes opens textport
    [System.Windows.Forms.SendKeys]::SendWait("{ESCAPE}")
    Start-Sleep -Milliseconds 300
    
    # Ctrl+V to paste
    [System.Windows.Forms.SendKeys]::SendWait("^v")
    Start-Sleep -Milliseconds 500
    
    # Press Enter to execute
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Seconds 2
    
    Write-Host "Commands pasted and executed!"
} else {
    Write-Host "TouchDesigner not found!"
}
