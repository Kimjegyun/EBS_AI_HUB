# Saved media playback policy

2026-10-23: AI Hub owns the gateway CSP. The common policy permits media-src 'self' blob: so embedded applications can play saved MP4/audio File objects without publishing them or sending them to an external server. Other directives remain independently configured; data: connections and arbitrary remote media are not enabled by this change.

ACAP owns its player and playback error messages. Do not treat a CSP rejection as proof of a corrupt MP4, and do not regenerate media to address a gateway policy failure. Verify the served HTTP header after gateway deployment and test the same valid H.264/AAC file in an actual browser. Existing sessions, provider settings, source assets and media are preserved.

Regression: scripts/security-hardening.test.mjs (test:security and verify:production-feedback). A valid final MP4 must decode, advance currentTime and seek under the served policy. This does not establish that a particular user's movie contains correct scenes or audio.
