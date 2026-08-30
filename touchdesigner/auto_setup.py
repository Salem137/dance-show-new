import td

def setup():
    # Delete all existing operators in /project1
    root = op('/')
    project1 = op('/project1')
    
    # Clear existing network
    for child in project1.children:
        child.destroy()
    
    # Create OSC In DAT
    osc = project1.create(oscinDAT, 'OSC_In_DAT1')
    osc.par.networkaddress = '127.0.0.1'
    osc.par.port = 3333
    osc.par.allowrejecting = True
    print('[SETUP] Created OSC In DAT on port 3333')

    # Video folder
    vf = project.folder.replace(chr(92), '/') + '/assets/videos/'

    # Create Movie File In TOPs for 2 test videos
    vids = ['scene1_joy.mp4', 'scene1_sorrow.mp4']
    movies = []
    for i, v in enumerate(vids):
        m = project1.create(moviefileinTOP, f'movie{i+1}')
        m.par.file = vf + v
        m.par.play = False
        m.par.loop = True
        m.par.allowforeignext = True
        movies.append(m)
        print(f'[SETUP] Created movie{i+1} -> {v}')

    # Create Switch TOP
    sw = project1.create(switchTOP, 'switch1')
    sw.par.index = 0
    sw.par.allowforeignext = True
    for m in movies:
        sw.inputConnectors[0].connect(m.outputConnectors[0])
    print('[SETUP] Created Switch TOP')

    # Create Null output
    n = project1.create(nullTOP, 'output')
    n.inputConnectors[0].connect(sw.outputConnectors[0])
    print('[SETUP] Created output Null')

    # Create OSC Callback
    cb = project1.create(textDAT, 'OSC_Callback')
    cb.text = '''
def onReceiveOSC(address, *args):
    print("OSC: " + str(address) + " " + str(args))
    if address.startswith("/play/video/"):
        vid = int(address.split("/")[-1])
        op('/project1/switch1').par.index = vid - 1
        print("Switch to video: " + str(vid))
'''
    print('[SETUP] Created OSC Callback')

    print('')
    print('========================================')
    print('  SETUP COMPLETE!')
    print('========================================')

try:
    setup()
except Exception as e:
    print(f'ERROR: {e}')
