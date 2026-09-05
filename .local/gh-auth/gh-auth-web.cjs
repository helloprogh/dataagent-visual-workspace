const { spawn } = require('node:child_process');

const child = spawn('gh', ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web'], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buffer = '';
const otpRe = /one-time code[:\s]*\n?\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i;
const enterRe = /press enter to open/i;

child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');

function onData(chunk) {
  buffer += chunk;
  process.stdout.write(chunk);
  if (otpRe.test(buffer) && process.env.OTP_SENT !== '1') {
    const m = buffer.match(otpRe);
    process.env.OTP_SENT = '1';
    console.log('\n=== OTP_CODE_START ===');
    console.log(m[1]);
    console.log('=== OTP_CODE_END ===\n');
    // open browser after a short delay, or send Enter if it waits
    setTimeout(() => { try { child.stdin.write('\n'); } catch (e) {} }, 1500);
  } else if (enterRe.test(buffer) && process.env.ENTER_SENT !== '1') {
    process.env.ENTER_SENT = '1';
    setTimeout(() => { try { child.stdin.write('\n'); } catch (e) {} }, 800);
  }
}

child.stdout.on('data', onData);
child.stderr.on('data', onData);

// answer the "Authenticate Git with your GitHub credentials?" prompt up front
setTimeout(() => { try { child.stdin.write('Y\n'); } catch (e) {} }, 400);
setTimeout(() => { try { child.stdin.write('Y\n'); } catch (e) {} }, 1500);

child.on('close', (code) => {
  console.log('\n=== GH_AUTH_PROCESS_EXIT:' + code + ' ===');
  process.exit(0);
});
child.on('error', (err) => { console.error('SPAWN_ERROR', err); process.exit(1); });
