Add-Type -AssemblyName System.Windows.Forms

# Start TouchDesigner
Start-Process "C:\Program Files\Derivative\TouchDesigner\bin\TouchDesigner.exe"
Write-Host "Waiting for TouchDesigner to load..."
Start-Sleep -Seconds 8

# Focus TouchDesigner
$proc = Get-Process TouchDesigner -ErrorAction SilentlyContinue
if ($proc) {
    [System.Windows.Forms.SendKeys]::SendWait("{ESCAPE}")
    Start-Sleep -Milliseconds 500

    # Open Textport with Alt+T
    [System.Windows.Forms.SendKeys]::SendWait("%t")
    Start-Sleep -Seconds 2

    # Type the setup commands
    $commands = @(
        "import td",
        "",
        "# Delete existing operators",
        "for child in op('/project1').children: child.destroy()",
        "",
        "# Create OSC In DAT",
        "osc = op('/project1').create(oscinDAT, 'OSC_In_DAT1')",
        "osc.par.port = 3333",
        "print('Created OSC In DAT')",
        "",
        "# Create Movie File In TOPs",
        "vf = project.folder.replace(chr(92), '/') + '/assets/videos/'",
        "",
        "m1 = op('/project1').create(moviefileinTOP, 'movie1')",
        "m1.par.file = vf + 'scene1_joy.mp4'",
        "m1.par.loop = True",
        "print('Created movie1')",
        "",
        "m2 = op('/project1').create(moviefileinTOP, 'movie2')",
        "m2.par.file = vf + 'scene1_sorrow.mp4'",
        "m2.par.loop = True",
        "print('Created movie2')",
        "",
        "# Create Switch TOP",
        "sw = op('/project1').create(switchTOP, 'switch1')",
        "sw.inputConnectors[0].connect(m1.outputConnectors[0])",
        "sw.inputConnectors[0].connect(m2.outputConnectors[0])",
        "sw.par.index = 0",
        "print('Created Switch')",
        "",
        "# Create output Null",
        "n = op('/project1').create(nullTOP, 'output')",
        "n.inputConnectors[0].connect(sw.outputConnectors[0])",
        "print('Created output')",
        "",
        "print('SETUP COMPLETE')"
    )

    foreach ($cmd in $commands) {
        if ($cmd -eq "") {
            [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
            Start-Sleep -Milliseconds 200
        } else {
            [System.Windows.Forms.SendKeys]::SendWait($cmd)
            Start-Sleep -Milliseconds 100
            [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
            Start-Sleep -Milliseconds 300
        }
    }

    Write-Host "Commands sent to TouchDesigner!"
} else {
    Write-Host "TouchDesigner not found!"
}
