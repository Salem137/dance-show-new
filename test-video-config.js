const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'server', 'config', 'show.json');
const videosDir = path.join(__dirname, 'assets', 'videos');

console.log('=== Testing Video Configuration ===\n');

// 1. Load config
console.log('1. Loading config...');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
console.log('   Show name:', config.showName);

// 2. Check all scenes
console.log('\n2. Checking scenes...');
config.scenes.forEach((scene, index) => {
  console.log(`\n   Scene ${index + 1}: ${scene.title} (${scene.type})`);
  
  if (scene.video) {
    const videoPath = path.join(videosDir, scene.video);
    const exists = fs.existsSync(videoPath);
    console.log(`     Video: ${scene.video} - ${exists ? '✓ EXISTS' : '✗ MISSING'}`);
  }
  
  if (scene.choices) {
    console.log('     Choices:');
    scene.choices.forEach(choice => {
      const videoPath = path.join(videosDir, choice.video);
      const exists = fs.existsSync(videoPath);
      console.log(`       - ${choice.id}: ${choice.label}`);
      console.log(`         Video: "${choice.video}" - ${exists ? '✓ EXISTS' : '✗ MISSING'}`);
      console.log(`         Duration: ${choice.videoDuration}s`);
    });
  }
});

// 3. Check voting scenes
console.log('\n3. Branching scenes (voting):');
const branchingScenes = config.scenes.filter(s => s.type === 'branching');
branchingScenes.forEach(scene => {
  console.log(`\n   ${scene.title}:`);
  scene.choices.forEach(choice => {
    const hasVideo = choice.video && choice.video.trim() !== '';
    const videoPath = path.join(videosDir, choice.video);
    const fileExists = fs.existsSync(videoPath);
    console.log(`     ${choice.label}: ${hasVideo ? (fileExists ? '✓ Video OK' : '✗ Video file missing') : '✗ No video assigned'}`);
  });
});

console.log('\n=== Test Complete ===');
