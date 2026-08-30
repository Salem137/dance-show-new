Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Write-Host "Step 1: Starting TouchDesigner..."
Start-Process "C:\Program Files\Derivative\TouchDesigner\bin\TouchDesigner.exe"

Write-Host "Step 2: Waiting 20 seconds for full load..."
Start-Sleep -Seconds 20

Write-Host "Step 3: Setting clipboard with exec command..."
$cmd = "exec(open('C:/dance-show/touchdesigner/dance_setup.py').read())"
[System.Windows.Forms.Clipboard]::SetText($cmd)
Start-Sleep -Milliseconds 500

Write-Host "Step 4: Opening Textport with Alt+D then T..."
[System.Windows.Forms.SendKeys]::SendWait("%d")
Start-Sleep -Milliseconds 500
[System.Windows.Forms.SendKeys]::SendWait("t")
Start-Sleep -Seconds 2

Write-Host "Step 5: Clicking inside textport area..."
# Click in the middle of the textport area
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$x = [int]($screen.Width * 0.4)
$y = [int]($screen.Height * 0.5)
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
Start-Sleep -Milliseconds 200
[System.Windows.Forms.SendKeys]::SendWait("{LEFTCLICK}")
Start-Sleep -Milliseconds 500

Write-Host "Step 6: Pasting command..."
[System.Windows.Forms.SendKeys]::SendWait("^v")
Start-Sleep -Milliseconds 500

Write-Host "Step 7: Pressing Enter..."
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Seconds 3

Write-Host "DONE! Check Textport for [OK] messages."
