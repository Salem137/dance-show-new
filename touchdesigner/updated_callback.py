def onReceiveOSC(dat, rowIndex, message, bytes, time, address, arguments):
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
