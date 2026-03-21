const { io } = require('socket.io-client');

const URL = process.env.WS_URL || 'http://localhost:3003';
const rideId = 'ride-e2e-test';

const sender = io(URL, { transports: ['websocket'], timeout: 8000 });
const receiver = io(URL, { transports: ['websocket'], timeout: 8000 });

let done = false;

function finish(code, message) {
  if (done) return;
  done = true;

  try {
    sender.disconnect();
  } catch {}

  try {
    receiver.disconnect();
  } catch {}

  console.log(message);
  process.exit(code);
}

receiver.on('connect', () => {
  receiver.emit('joinRideTracking', { rideId, userId: 'driver-test' });
});

sender.on('connect', () => {
  sender.emit('joinRideTracking', { rideId, userId: 'passenger-test' });

  setTimeout(() => {
    sender.emit('passengerLocationUpdate', {
      rideId,
      passengerId: 'passenger-test',
      bookingId: 'booking-test',
      lat: 5.35,
      lng: -4.02,
      accuracy: 10,
    });
  }, 500);
});

receiver.on('passengerLocationUpdate', (payload) => {
  const ok =
    payload &&
    payload.rideId === rideId &&
    payload.location &&
    payload.location.lat === 5.35 &&
    payload.location.lng === -4.02;

  if (ok) {
    finish(0, '[PASS] WebSocket passengerLocationUpdate broadcast received');
  }
});

setTimeout(() => {
  finish(1, '[FAIL] WebSocket event not received within timeout');
}, 12000);
