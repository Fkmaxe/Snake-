export class Random {
  constructor(seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) { this.seed = seed || 1; }
  next() {
    let value = this.seed;
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    this.seed = value >>> 0;
    return this.seed / 0x100000000;
  }
  integer(maximum) { return Math.floor(this.next() * maximum); }
}
