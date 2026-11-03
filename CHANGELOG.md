# Changelog

## [0.2.0](https://github.com/Doggo785/ListFM/compare/v0.1.1...v0.2.0) (2026-11-03)


### Features

* **automations:** run cron schedules in the user's timezone ([#92](https://github.com/Doggo785/ListFM/issues/92)) ([f433b18](https://github.com/Doggo785/ListFM/commit/f433b185e0d08290c20ce02da8ab62790992bc02))


### Bug Fixes

* **auth:** move automations and drop personal cache when relinking Last.fm ([#90](https://github.com/Doggo785/ListFM/issues/90)) ([8798578](https://github.com/Doggo785/ListFM/commit/87985785f8cd2237b63086beac2bbe4efeb2defb))
* **auth:** send the user back to login when the session expires ([#96](https://github.com/Doggo785/ListFM/issues/96)) ([c4f85d9](https://github.com/Doggo785/ListFM/commit/c4f85d94434da23e384ded51f95461df3bd5f0f9))
* **auth:** stop logging out two tabs that refresh at the same time ([#94](https://github.com/Doggo785/ListFM/issues/94)) ([4d6be53](https://github.com/Doggo785/ListFM/commit/4d6be53c99c583f350f9793d6cdee013a9acfe93))
* **dashboard:** always fetch recent tracks live ([#93](https://github.com/Doggo785/ListFM/issues/93)) ([e4fc3ff](https://github.com/Doggo785/ListFM/commit/e4fc3ff3556302b6e5d8d0d421a2e44f73efbabf))
* **runner:** show a generic run error instead of the exception text ([#95](https://github.com/Doggo785/ListFM/issues/95)) ([044fa0e](https://github.com/Doggo785/ListFM/commit/044fa0ea33747defa84ee8b86b5ed426ba711a65))
* **sources:** stop passing the worldwide count as your plays for top artists ([#97](https://github.com/Doggo785/ListFM/issues/97)) ([f19b1c4](https://github.com/Doggo785/ListFM/commit/f19b1c4fdfbf8b653a54dccf5c4f1bfaecee3047))

## [0.1.1](https://github.com/Doggo785/ListFM/compare/v0.1.0...v0.1.1) (2026-11-03)


### Bug Fixes

* **auth:** link an OAuth login to a local account only when both emails are verified ([#87](https://github.com/Doggo785/ListFM/issues/87)) ([944f032](https://github.com/Doggo785/ListFM/commit/944f0329eec59cb5d86a6afccdd9d349c39d1c3e))
* **enrich:** never cache defaults left by a failed Last.fm call ([#83](https://github.com/Doggo785/ListFM/issues/83)) ([d2dbdbb](https://github.com/Doggo785/ListFM/commit/d2dbdbbf270ac5ed2a9a324fe12cca732223aec6))
* **logging:** keep the Last.fm API key out of httpx request logs ([#86](https://github.com/Doggo785/ListFM/issues/86)) ([54c76e7](https://github.com/Doggo785/ListFM/commit/54c76e794254cff58a22db93cb91e14e0a60baed))
* **runner:** bump last_run on failed runs so the sweep stops rerunning them ([#82](https://github.com/Doggo785/ListFM/issues/82)) ([49ad064](https://github.com/Doggo785/ListFM/commit/49ad06418f9ec0f3889794237724f75429b311f2))


### Performance Improvements

* **enrich:** fetch track fields with one track.getInfo call ([#88](https://github.com/Doggo785/ListFM/issues/88)) ([d72d4a7](https://github.com/Doggo785/ListFM/commit/d72d4a735b909ac801864bf5aacc318f047f3661))

## 0.1.0 (2026-11-03)


### Features

* **automations:** skip enrich when filters need nothing ([#42](https://github.com/Doggo785/ListFM/issues/42)) ([f1a5eca](https://github.com/Doggo785/ListFM/commit/f1a5ecae034958ec2749aee90a126cc9e160db41))
* **cache:** differentiated freshness kills the 24h cliff (4b) ([#47](https://github.com/Doggo785/ListFM/issues/47)) ([ad54cd8](https://github.com/Doggo785/ListFM/commit/ad54cd8669c957b697d8fc7894f26cc53a75b78f))
* **cache:** explicit per-group tags freshness (4a) ([#46](https://github.com/Doggo785/ListFM/issues/46)) ([cdebea5](https://github.com/Doggo785/ListFM/commit/cdebea56c953710a2943e061cd5c2b48c064cef7))
* **lastfm:** faster cadence, extended recents, rate-limit backoff ([#45](https://github.com/Doggo785/ListFM/issues/45)) ([f57fabb](https://github.com/Doggo785/ListFM/commit/f57fabb5895cd308e4c8fdcc810ee7a2a6aa7eec))
* **progress:** live counter and bar for runs and previews ([#43](https://github.com/Doggo785/ListFM/issues/43)) ([f821a7e](https://github.com/Doggo785/ListFM/commit/f821a7eace1acd0d104fe08c914c9a570a7cd8c6))
* **sweep:** isolate per-automation commits, harden pool, return JSON DB errors ([#39](https://github.com/Doggo785/ListFM/issues/39)) ([9b13ac6](https://github.com/Doggo785/ListFM/commit/9b13ac632f5a6da20f32243d2dd0de422a587705))


### Bug Fixes

* **deps:** bump undici and zod to clear osv-scanner high findings ([#61](https://github.com/Doggo785/ListFM/issues/61)) ([3235409](https://github.com/Doggo785/ListFM/commit/3235409fd50750346c43d4aa17ed833c5ee799d6))
* **deps:** clear osv-scanner High findings, certifi 2026.10.19 + vite 8.3.5 ([#53](https://github.com/Doggo785/ListFM/issues/53)) ([f4ed000](https://github.com/Doggo785/ListFM/commit/f4ed000971140b5644364d58634b8c0e124474f8))
* **p1:** pin remaining deps and label dashboard recents as partial preview ([#41](https://github.com/Doggo785/ListFM/issues/41)) ([ce0827e](https://github.com/Doggo785/ListFM/commit/ce0827e6c49ea90a989ea4dd1519a1daf97d0a79))
