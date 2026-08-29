// Shared MediaPipe Hands finger-gesture detection.
//
// Used by both the practice tool (hand.html/hand.js) and the real song
// viewer's chunk navigation (song.js), so the two stay in sync instead of
// drifting apart as separate copies.

function getLandmarkDistance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function getExtendedFingers(landmarks) {
    const extended = {
        thumb: false,
        index: false,
        middle: false,
        ring: false,
        pinky: false
    };

    const wrist = landmarks[0];

    // Thumb
    const thumbTip = landmarks[4];
    const thumbMCP = landmarks[2];
    const thumbDist = Math.abs(thumbTip.x - wrist.x);
    const thumbBaseDist = Math.abs(thumbMCP.x - wrist.x);
    extended.thumb = thumbDist > thumbBaseDist * 1.3;

    // Other fingers
    const fingerData = [
        { name: 'index', tip: 8, pip: 6 },
        { name: 'middle', tip: 12, pip: 10 },
        { name: 'ring', tip: 16, pip: 14 },
        { name: 'pinky', tip: 20, pip: 18 }
    ];

    fingerData.forEach(finger => {
        const tipY = landmarks[finger.tip].y;
        const pipY = landmarks[finger.pip].y;
        extended[finger.name] = tipY < pipY - 0.03;
    });

    return extended;
}

// Detect a specific named gesture from one hand's landmarks.
function detectHandGesture(landmarks) {
    if (!landmarks || landmarks.length === 0) return 'No hand';

    const extended = getExtendedFingers(landmarks);
    const fingerCount = Object.values(extended).filter(v => v).length;

    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const distance = getLandmarkDistance(thumbTip, indexTip);

    // Pinch - thumb and index very close (check this first)
    if (distance < 0.05) {
        return '🤏 Pinch';
    }

    // OK sign - thumb and index forming circle, other fingers extended
    if (distance < 0.08 && extended.middle && extended.ring && extended.pinky) {
        return '👌 OK';
    }

    // Peace sign - index and middle extended, others closed
    if (!extended.thumb && extended.index && extended.middle && !extended.ring && !extended.pinky) {
        return '✌️ Peace';
    }

    // Pointing - only index extended
    if (!extended.thumb && extended.index && !extended.middle && !extended.ring && !extended.pinky) {
        return '☝️ Pointing';
    }

    // Rock/Metal sign - index and pinky extended, middle and ring closed
    if (extended.index && !extended.middle && !extended.ring && extended.pinky) {
        return '🤘 Rock';
    }

    // Call me - thumb and pinky extended, others closed
    if (extended.thumb && !extended.index && !extended.middle && !extended.ring && extended.pinky) {
        return '🤙 Call Me';
    }

    // Thumbs up - only thumb extended, thumb pointing up
    if (extended.thumb && !extended.index && !extended.middle && !extended.ring && !extended.pinky) {
        const thumbBase = landmarks[2];
        if (thumbTip.y < thumbBase.y - 0.05) {
            return '👍 Thumbs Up';
        }
        if (thumbTip.y > thumbBase.y + 0.05) {
            return '👎 Thumbs Down';
        }
        return '👍/👎 Thumb';
    }

    // Open palm - all fingers extended and spread
    if (fingerCount === 5) {
        const pinkyTip = landmarks[20];
        const spread = getLandmarkDistance(indexTip, pinkyTip);
        if (spread > 0.12) {
            return '🖐️ Open Palm';
        }
    }

    // Fist
    if (fingerCount === 0) {
        return '✊ Fist';
    }

    // Default: show finger count
    return `${fingerCount} finger${fingerCount !== 1 ? 's' : ''}`;
}
