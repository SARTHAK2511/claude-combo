"""Synthesizes Combo Meter's chiptune effects into sfx/*.wav. Run: python3 tools/make-sfx.py"""
import math, os, random, struct, wave

RATE = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'sfx')
random.seed(7)


def note(name):
    names = {'C': -9, 'D': -7, 'E': -5, 'F': -4, 'G': -2, 'A': 0, 'B': 2}
    return 440.0 * 2 ** ((names[name[0]] + 12 * (int(name[-1]) - 4)) / 12)


def osc(kind, phase, duty=0.5):
    p = phase % 1.0
    if kind == 'square':
        return 1.0 if p < duty else -1.0
    if kind == 'triangle':
        return 4 * abs(p - 0.5) - 1
    if kind == 'noise':
        return random.uniform(-1, 1)
    return math.sin(2 * math.pi * p)


def tone(freq_from, freq_to, seconds, kind='square', gain=0.35, duty=0.5, attack=0.004, decay=None):
    n = int(RATE * seconds)
    out, phase = [], 0.0
    for i in range(n):
        t = i / n
        freq = freq_from * (freq_to / freq_from) ** t
        phase += freq / RATE
        env = min(1.0, i / (attack * RATE + 1))
        env *= (1 - t) ** decay if decay else min(1.0, (n - i) / (0.01 * RATE + 1))
        out.append(osc(kind, phase, duty) * gain * env)
    return out


def mix(*tracks):
    length = max(len(t) for t in tracks)
    return [sum(t[i] for t in tracks if i < len(t)) for i in range(length)]


def seq(*parts):
    return [s for part in parts for s in part]


def rest(seconds):
    return [0.0] * int(RATE * seconds)


def save(name, samples):
    peak = max(1e-9, max(abs(s) for s in samples))
    scale = min(1.0, 0.9 / peak)
    with wave.open(os.path.join(OUT, name), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(s * scale * 32767)) for s in samples))


# Rank up: a quick major arpeggio that lands an octave up.
save('rankup.wav', seq(*[tone(note(n), note(n), 0.065, duty=0.25) for n in ['C5', 'E5', 'G5']],
                       tone(note('C6'), note('C6'), 0.22, duty=0.25, decay=1.5)))

# Special move: a rising sweep with a sparkle on top.
save('special.wav', mix(tone(260, 1300, 0.38, 'triangle', 0.45, decay=0.6),
                        seq(rest(0.18), tone(note('E6'), note('E6'), 0.06, duty=0.125, gain=0.2),
                            tone(note('B6'), note('B6'), 0.12, duty=0.125, gain=0.2, decay=2))))

# Combo break: a falling square into a crunch of noise.
save('break.wav', mix(tone(520, 70, 0.42, 'square', 0.4, duty=0.5, decay=1.2),
                      tone(1, 1, 0.22, 'noise', 0.25, decay=2.5)))

# New record: the classic fanfare, three shorts and a long.
save('record.wav', seq(*[seq(tone(note('G5'), note('G5'), 0.09, duty=0.25), rest(0.025)) for _ in range(3)],
                       mix(tone(note('C6'), note('C6'), 0.42, duty=0.25, decay=1.2),
                           tone(note('E5'), note('E5'), 0.42, 'triangle', 0.25, decay=1.2))))

# Perfect turn: a bell-like major chord that rings out.
save('perfect.wav', mix(*[tone(note(n), note(n), 0.7, 'triangle', 0.3, decay=2.2) for n in ['C5', 'E5', 'G5', 'C6']]))
