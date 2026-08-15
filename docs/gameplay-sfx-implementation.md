# Gameplay SFX source analysis

The original recordings in `Game SFX - Latest.zip` are retained unchanged. The
app contains only short `.m4a` derivatives, cut from those recordings so that
the physical simulation, not a prerecorded timeline, decides when an event is
heard.

## Recording findings

| Recording | Decoded duration | Detected useful transient regions | Gameplay use |
| --- | ---: | --- | --- |
| Racket hit SFX 1–4 | 1.000 s each | 0.00–0.10 s (depending on take) | Four natural paddle-hit variants. |
| Card placing SFX 1 | 1.250 s | about 0.66 s | Soft card placement. |
| Card placing SFX 2 | 7.274 s | about 1.88, 2.26, 2.71, 4.21, 4.51, 4.97, 6.61, 6.83 s | Natural normal/slap card-contact variants. |
| Dice rolling | 1.000 s | about 0.13–0.25 s | Short result/collision impact. |
| Dice shaking | 1.174 s | about 0.35, 0.40, 0.56, 0.58, 0.62, 0.75, 0.81, 0.96 s | Short shake texture during the animation. |
| Initial cue-ball hit | 1.361 s | about 0.77 and 0.93 s | Cue strike and isolated ball collision. |
| Ball enters pocket | 2.500 s | about 0.24, 0.55, 0.91, 1.60 s | Pocket edge and pocket drop. |
| Cue ball hit and enters pocket | 1.289 s | about 0.43 and 0.95 s | Cue scratch/drop. |
| Carrom SFX 1 | 1.250 s | about 0.38–0.62 s | Two piece-contact variants. |
| Carrom SFX 2 | 1.250 s | about 0.57 and 0.78 s | Boundary and pocket contacts. |
| Chess piece move | 2.001 s | about 1.19 s | Trimmed board-contact sound. |

Transient locations were obtained from decoded 10 ms RMS-envelope windows;
they are used only to make trimmed derivatives and do not alter the originals.

## Runtime architecture

`lib/soundManager.ts` owns decoding, preload, variant rotation, source-node
polyphony, per-event voice caps, cooldowns, perceptual intensity gain, very
small pitch variation, and optional stereo placement. Components emit semantic
events such as `playBallCollision`, `playRailCollision`, `playPaddleHit`, and
`playCarromCollision` from their existing simulation values.

Pool, Snooker, and Carrom pass their real collision impulse or speed. Ping Pong
passes ball speed at paddle, net, and table contact. Card games use placement
intensity; dice games use a short shake texture during their visual shake and a
source-derived impact at the result.
