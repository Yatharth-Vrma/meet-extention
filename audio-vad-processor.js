/* Audio Worklet VAD Processor
 * Segments voiced audio using simple RMS threshold + hangover.
 * Posts {type:'segment', enough:boolean, samples:Float32Array, sampleRate:number}
 */
class VADProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const p = options.processorOptions || {};
    this.vadThreshold = p.vadThreshold ?? 0.013; // RMS threshold
    this.minMs = p.minMs ?? 300;                // minimum voiced duration to emit
    this.maxMs = p.maxMs ?? 8000;               // maximum segment length cap
    this.silenceMs = p.silenceMs ?? 500;        // hangover after last voice
    this.startTs = 0;        // ms
    this.lastVoiceTs = 0;    // ms
    this.active = false;
    this.buffers = [];
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true; // keep alive
    const channel = input[0];

    // RMS
    let sum = 0; for (let i=0;i<channel.length;i++){ const v=channel[i]; sum += v*v; }
    const rms = Math.sqrt(sum / channel.length);
    const now = currentTime * 1000; // ms

    if (rms > this.vadThreshold) {
      if (!this.active) {
        this.active = true;
        this.startTs = now;
        this.buffers = [];
      }
      this.lastVoiceTs = now;
    }

    if (this.active) {
      // copy buffer slice to avoid GC surprises
      this.buffers.push(new Float32Array(channel));
      const activeMs = now - this.startTs;
      const silenceMs = this.lastVoiceTs ? (now - this.lastVoiceTs) : 0;
      const shouldEnd = (this.lastVoiceTs && silenceMs > this.silenceMs) || activeMs > this.maxMs;
      if (shouldEnd) {
        const totalSamples = this.buffers.reduce((n,b)=>n+b.length,0);
        const out = new Float32Array(totalSamples);
        let off=0; for (const b of this.buffers){ out.set(b,off); off += b.length; }
        const voicedMs = activeMs;
        const enough = voicedMs >= this.minMs;
        this.port.postMessage({ type:'segment', enough, samples: out, sampleRate });
        this.active = false;
        this.buffers = [];
        this.startTs = 0;
        this.lastVoiceTs = 0;
      }
    }

    return true; // keep processor alive
  }
}

registerProcessor('vad-processor', VADProcessor);
