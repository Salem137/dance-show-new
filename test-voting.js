const http = require('http');

const BASE_URL = 'http://localhost:3000';

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testVoting() {
  console.log('=== Testing Voting Flow ===\n');

  // 1. Start show
  console.log('1. Starting show...');
  const startResult = await makeRequest('POST', '/admin/api/start-show');
  console.log('   Start result:', startResult.success);

  await sleep(1000);

  // 2. Advance to branching scene
  console.log('\n2. Advancing to branching scene...');
  let currentState = await makeRequest('GET', '/api/state');
  let maxAttempts = 10;
  
  while (currentState.currentScene?.type !== 'branching' && maxAttempts > 0) {
    console.log(`   Current: ${currentState.currentScene?.title} (${currentState.currentScene?.type})`);
    await makeRequest('POST', '/admin/api/next-scene');
    await sleep(500);
    currentState = await makeRequest('GET', '/api/state');
    maxAttempts--;
  }

  if (currentState.currentScene?.type !== 'branching') {
    console.log('   ERROR: Could not find branching scene');
    return;
  }

  console.log(`   Found branching scene: ${currentState.currentScene?.title}`);

  // 3. Get scene details
  const scene = currentState.currentScene;
  console.log('\n3. Scene details:');
  console.log('   Title:', scene.title);
  console.log('   Choices:');
  scene.choices.forEach(c => {
    console.log(`     - ${c.id}: ${c.label} (Video: "${c.video}", Duration: ${c.videoDuration}s)`);
  });

  // 4. Open voting
  console.log('\n4. Opening voting...');
  const openResult = await makeRequest('POST', '/admin/api/open-voting');
  console.log('   Voting opened:', openResult.success);

  await sleep(500);

  // 5. Cast votes
  console.log('\n5. Casting votes...');
  const votesForJoy = 5;
  const votesForSadness = 3;
  
  for (let i = 0; i < votesForJoy; i++) {
    await makeRequest('POST', `/api/vote/joy`);
    await sleep(100);
  }
  
  for (let i = 0; i < votesForSadness; i++) {
    await makeRequest('POST', `/api/vote/sadness`);
    await sleep(100);
  }

  console.log(`   Cast ${votesForJoy} votes for Joy`);
  console.log(`   Cast ${votesForSadness} votes for Sadness`);

  // 6. Check vote counts
  console.log('\n6. Vote counts:');
  const voteState = await makeRequest('GET', '/api/state');
  console.log('   Votes:', JSON.stringify(voteState.voteCounts, null, 2));
  console.log('   Total:', voteState.totalVotes);

  // 7. Trigger winner
  console.log('\n7. Triggering winner...');
  const winnerResult = await makeRequest('POST', '/admin/api/trigger-winner');
  console.log('   Success:', winnerResult.success);
  console.log('   Winner:', winnerResult.winner?.label);
  console.log('   Winner video:', winnerResult.winner?.video);
  console.log('   Winner duration:', winnerResult.winner?.videoDuration);

  // 8. Wait and check state
  console.log('\n8. Waiting 3 seconds for video to start...');
  await sleep(3000);

  const finalState = await makeRequest('GET', '/api/state');
  console.log('   Show phase:', finalState.showPhase);
  console.log('   Voting open:', finalState.votingOpen);

  console.log('\n=== Test Complete ===');
  console.log('\nCheck the stage view at http://localhost:3000/stage/');
  console.log('The winner video should be playing now.');
}

testVoting().catch(console.error);
