import td


def setup():
    container = op('/project1')
    
    me_name = me.name if 'me' in globals() else ''
    for c in list(container.children):
        if c.name != me_name:
            try:
                c.destroy()
            except:
                pass
    
    vf = 'C:/dance-show/assets/videos/'
    
    osc = container.create(oscinDAT, 'OSC_In')
    osc.par.port = 3333
    osc.nodeX = 0
    osc.nodeY = -100
    
    vids = [
        ('v0', 'Video_00_Intro_TD.mp4'),
        ('v1', 'Video_01_Main_TD.mp4'),
        ('v2', 'Video_02_Joy_TD.mp4'),
        ('v3', 'Video_02_Sadness_TD.mp4'),
        ('v4', 'Video_03_Main_TD.mp4'),
        ('v5', 'Video_04_Anger_TD.mp4'),
        ('v6', 'Video_04_Calm_TD.mp4'),
        ('v7', 'Video_END_TD.mp4'),
    ]
    for i, (name, file) in enumerate(vids):
        m = container.create(moviefileinTOP, name)
        m.par.file = vf + file
        m.par.play = False
        m.par.cue = True
        m.nodeX = 200 + (i * 200)
        m.nodeY = -100
    
    sw = container.create(switchTOP, 'Switch')
    sw.par.index = 0
    sw.nodeX = 100
    sw.nodeY = -400
    
    for i, (name, _) in enumerate(vids):
        movie = op('/project1/' + name)
        movie.outputConnectors[0].connect(sw.inputConnectors[i])
    
    out = container.create(nullTOP, 'Out')
    sw.outputConnectors[0].connect(out.inputConnectors[0])
    out.nodeX = 400
    out.nodeY = -400
    
    cb = container.create(textDAT, 'OSC_Cb')
    cb.text = """def onReceiveOSC(dat, rowIndex, message, bytes, time, address, arguments):
    addr = str(address)
    args = list(arguments) if arguments else []
    debug('OSC: ' + addr + ' args=' + str(args))
    
    names = ['v0','v1','v2','v3','v4','v5','v6','v7']
    
    if addr.startswith('/play/video/'):
        parts = addr.split('/')
        idx = int(parts[-1])
        op('/project1/Switch').par.index = idx
        
        for i, n in enumerate(names):
            v = op('/project1/' + n)
            if v:
                if i == idx:
                    v.par.cue = False
                    v.par.play = True
                    v.par.speed = 1.0
                    v.par.cuepoint = 0
                    v.par.cuepulse.pulse()
                else:
                    v.par.play = False
                    v.par.cue = True
        debug('>>> PLAY video index: ' + str(idx))
    
    elif addr.startswith('/show/start'):
        op('/project1/Switch').par.index = 0
        for i, n in enumerate(names):
            v = op('/project1/' + n)
            if v:
                if i == 0:
                    v.par.cue = False
                    v.par.play = True
                    v.par.speed = 1.0
                    v.par.cuepoint = 0
                    v.par.cuepulse.pulse()
                else:
                    v.par.play = False
                    v.par.cue = True
        debug('>>> SHOW START')
    
    elif addr.startswith('/voting/Start') or addr.startswith('/voting/start'):
        debug('>>> VOTING START')
    
    elif addr.startswith('/voting/End') or addr.startswith('/voting/end'):
        debug('>>> VOTING END')
"""
    cb.nodeX = 0
    cb.nodeY = -400
    
    osc.par.callbacks = cb.path
    
    print('Switch inputs connected:', len(sw.inputs))
    print('SETUP COMPLETE!')


setup()
