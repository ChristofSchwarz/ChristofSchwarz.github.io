// playtones.js - Generate and play count-in tones for music practice

// Generate a single tone with silence padding
function generateTone(frequency, toneDuration, sampleRate = 44100) {
    const numToneSamples = Math.floor(sampleRate * toneDuration);
    const samples = [];
    const volume = 0.3;
    
    for (let i = 0; i < numToneSamples; i++) {
        const t = i / sampleRate;
        const envelope = Math.exp(-t * 20); // Decay envelope
        const sample = Math.sin(2 * Math.PI * frequency * t) * envelope * volume;
        const intSample = Math.max(-1, Math.min(1, sample)) * 0x7FFF;
        samples.push(intSample);
    }
    
    return samples;
}

// Generate complete count-in WAV file with all beeps pre-timed
function generateCountInWav(bpm, beatsPerBar, sampleRate = 44100) {
    const initialDelay = 0.2; // 200ms initial silence
    const beatDuration = 60 / bpm; // Duration of one beat in seconds
    const toneDuration = 0.08; // 80ms tone
    const totalBeats = beatsPerBar * 2; // 2 bars
    
    // Calculate total samples needed
    const numInitialSilence = Math.floor(sampleRate * initialDelay);
    const samplesPerBeat = Math.floor(sampleRate * beatDuration);
    const totalSamples = numInitialSilence + (samplesPerBeat * totalBeats);
    
    // Create array to hold all samples
    const allSamples = new Int16Array(totalSamples);
    
    // Initial silence (already zeros)
    
    // Generate each beat at exact position
    for (let beat = 0; beat < totalBeats; beat++) {
        const isAccent = (beat % beatsPerBar === 0);
        const frequency = isAccent ? 1200 : 800;
        
        // Generate tone samples
        const toneSamples = generateTone(frequency, toneDuration, sampleRate);
        
        // Calculate exact position for this beat
        const beatPosition = numInitialSilence + (beat * samplesPerBeat);
        
        // Copy tone samples into the main array
        for (let i = 0; i < toneSamples.length && (beatPosition + i) < totalSamples; i++) {
            allSamples[beatPosition + i] = toneSamples[i];
        }
    }
    
    // Create WAV file with all the samples
    const numChannels = 1;
    const bitsPerSample = 16;
    const buffer = new ArrayBuffer(44 + totalSamples * 2);
    const view = new DataView(buffer);
    
    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + totalSamples * 2, true);
    writeString(view, 8, 'WAVE');
    
    // FMT sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
    view.setUint16(32, numChannels * bitsPerSample / 8, true);
    view.setUint16(34, bitsPerSample, true);
    
    // Data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, totalSamples * 2, true);
    
    // Write all samples
    for (let i = 0; i < totalSamples; i++) {
        view.setInt16(44 + i * 2, allSamples[i], true);
    }
    
    return buffer;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

/**
 * Play a count-in with specified BPM and time signature
 * All beeps are pre-generated in a single WAV file with precise timing
 * @param {number} bpm - Beats per minute (tempo)
 * @param {number} beatsPerBar - Number of beats per bar (e.g., 4 for 4/4 time)
 * @param {Function} onComplete - Optional callback when count-in completes
 * @param {Function} onTick - Optional callback for each tick with (tickNumber, isAccent)
 */
function playCountInTones(bpm, beatsPerBar = 4, onComplete = null, onTick = null) {
    // Validate inputs
    if (!bpm || bpm < 40 || bpm > 240) {
        console.error('Invalid BPM:', bpm);
        return false;
    }
    
    if (!beatsPerBar || beatsPerBar < 2 || beatsPerBar > 12) {
        console.error('Invalid beats per bar:', beatsPerBar);
        return false;
    }

    try {
        console.log(`Playing count-in: ${bpm} BPM, ${beatsPerBar}/4 time`);
        
        // Generate complete WAV file with all beeps at exact positions
        const wavBuffer = generateCountInWav(bpm, beatsPerBar);
        const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
        const wavUrl = URL.createObjectURL(wavBlob);
        
        // Play the entire count-in as one audio file
        const audio = new Audio(wavUrl);
        audio.volume = 1.0;
        
        // Calculate total duration for completion callback
        const beatDuration = (60 / bpm) * 1000;
        const totalDuration = (beatsPerBar * 2 * beatDuration) + 200; // +200ms for initial delay
        
        // Optional: Schedule onTick callbacks at the right times
        if (onTick) {
            const totalBeats = beatsPerBar * 2;
            for (let i = 0; i < totalBeats; i++) {
                const tickTime = 200 + (i * beatDuration); // +200ms for initial delay
                const isAccent = (i % beatsPerBar === 0);
                setTimeout(() => {
                    onTick(i + 1, isAccent);
                }, tickTime);
            }
        }
        
        // Schedule completion callback
        if (onComplete) {
            setTimeout(() => {
                console.log('Count-in complete');
                onComplete();
            }, totalDuration);
        }
        
        // Play and cleanup
        audio.play().then(() => {
            console.log('Count-in started');
        }).catch((error) => {
            console.error('Error playing count-in:', error);
            if (onComplete) onComplete();
        });
        
        audio.addEventListener('ended', () => {
            URL.revokeObjectURL(wavUrl);
            console.log('Count-in audio ended');
        });
        
        return true;
    } catch (error) {
        console.error('Error in playCountInTones:', error);
        return false;
    }
}
