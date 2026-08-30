# =============================================
# DANCE SHOW - TouchDesigner Auto Setup
# Run this script inside TouchDesigner
# =============================================

# Step 1: Create OSC In DAT
osc_in = mod.create('oscin', 'OSC_In_DAT1')
osc_in.par.port = 3333
print("Created OSC In DAT on port 3333")

# Step 2: Create Movie File In TOPs for each video
videos = [
    "scene1_joy.mp4",
    "scene1_sorrow.mp4",
    "scene2_urban.mp4",
    "scene2_forest.mp4",
    "scene2_sea.mp4",
    "scene3_standing.mp4",
    "scene3_letgo.mp4",
    "scene4_slow.mp4",
    "scene4_fast.mp4",
    "scene4_wild.mp4",
    "scene5_triumph.mp4",
    "scene5_reflection.mp4",
    "scene5_mystery.mp4"
]

video_folder = project.folder + "/assets/videos/"

movie_ops = []
for i, video in enumerate(videos):
    op_name = f"movie{i+1}"
    movie_top = mod.create('moviefilein', op_name)
    movie_top.par.file = video_folder + video
    movie_top.par.play = False
    movie_ops.append(movie_top)
    print(f"Created {op_name} -> {video}")

# Step 3: Create Switch TOP
switch_top = mod.create('switch', 'switch1')
for i, movie_op in enumerate(movie_ops):
    switch_top.inputConnectors[i].connect(movie_op.outputConnectors[0])
switch_top.par.index = 0
print("Created Switch TOP with all 13 inputs")

# Step 4: Create DAT Execute for OSC parsing
dat_exec = mod.create('datexecute', 'OSC_Parser')
text_dat = mod.create('text', 'OSC_Callback')
text_dat.text = '''
def onReceiveOSC(address, *args):
    """
    Called when an OSC message is received.
    """
    print("OSC Received: " + str(address) + " " + str(args))

    if address.startswith("/play/video/"):
        video_id = int(address.split("/")[-1])
        op('switch1').par.index = video_id - 1
        print("Switching to video index: " + str(video_id - 1))

    elif address == "/scene/start":
        print("Scene transition triggered")

    elif address == "/voting/start":
        print("Voting opened")

    elif address == "/voting/end":
        print("Voting closed")
'''

print("")
print("============================================")
print("  SETUP COMPLETE!")
print("============================================")
print("")
print("Now connect:")
print("  switch1 output -> your projector/output")
print("")
print("To test: open admin panel and send")
print("  /play/video/1 in OSC Controls")
print("")
