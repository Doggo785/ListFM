# Changelog

## [0.3.0](https://github.com/Doggo785/ListFM/compare/v0.2.1...v0.3.0) (2026-11-04)


### Features

* **automations:** add a listening moment filter and let the sort count it ([#113](https://github.com/Doggo785/ListFM/issues/113)) ([fc78185](https://github.com/Doggo785/ListFM/commit/fc7818535b56b67c335ac9d9b6825109dd012796))
* **automations:** add a retry route that keeps the scheduled date ([#115](https://github.com/Doggo785/ListFM/issues/115)) ([e82ad24](https://github.com/Doggo785/ListFM/commit/e82ad24afb34955354c78a4c895b47b561b506e2))
* **automations:** add first listen and artist rank filters and playlist limits ([#111](https://github.com/Doggo785/ListFM/issues/111)) ([e30d5ec](https://github.com/Doggo785/ListFM/commit/e30d5ec5303c790dde1c296dc4883a859e86f468))
* **automations:** read listens through a window and a sort ([#109](https://github.com/Doggo785/ListFM/issues/109)) ([c1e88b7](https://github.com/Doggo785/ListFM/commit/c1e88b70442c4849c7004c79085b3a3f37b6e378))
* **automations:** report stage counts, known tags and tag progress ([#114](https://github.com/Doggo785/ListFM/issues/114)) ([4b9cd62](https://github.com/Doggo785/ListFM/commit/4b9cd622f7d1cee08e7fc6848a4659d11539c007))
* **logs:** print one readable console line per step of the app's work ([#120](https://github.com/Doggo785/ListFM/issues/120)) ([9836ef8](https://github.com/Doggo785/ListFM/commit/9836ef802e44097b59e02ebc90f6da8f7fb6453b))
* **sync:** fill a shared artist tag catalogue in the background ([#110](https://github.com/Doggo785/ListFM/issues/110)) ([8099240](https://github.com/Doggo785/ListFM/commit/8099240f25614acf1c9ab048854860975ced9525))
* **sync:** keep each track's album and add a limit per album ([#112](https://github.com/Doggo785/ListFM/issues/112)) ([2a90caf](https://github.com/Doggo785/ListFM/commit/2a90caf8ad91f2c661efa8a2b12cc6a0ebd9823b))
* **sync:** store each user's full listening history locally ([#107](https://github.com/Doggo785/ListFM/issues/107)) ([2313008](https://github.com/Doggo785/ListFM/commit/23130080f98de1ec86ae1906fa82341d4530416f))


### Bug Fixes

* **automations:** count an album's reissues as one album in the limit ([#119](https://github.com/Doggo785/ListFM/issues/119)) ([8ac3026](https://github.com/Doggo785/ListFM/commit/8ac30269d481621fb8ccadf57646e8cbe8241419))
* **automations:** make Run honest during the first load and with unsaved changes ([#117](https://github.com/Doggo785/ListFM/issues/117)) ([1b879f7](https://github.com/Doggo785/ListFM/commit/1b879f76ae1de55ce3a55315572855cc701f1f40))
* **dashboard:** show the stored totals and send the logo to the dashboard ([#118](https://github.com/Doggo785/ListFM/issues/118)) ([13bd00d](https://github.com/Doggo785/ListFM/commit/13bd00dba7b1595a24a73aca8bd4ad3f99ad9218))
* **filters:** make the filter screen and the preview tell the truth ([#116](https://github.com/Doggo785/ListFM/issues/116)) ([b95ed1e](https://github.com/Doggo785/ListFM/commit/b95ed1ede62a757faa62ae64f7cf2351ad3bded5))

## [0.2.1](https://github.com/Doggo785/ListFM/compare/v0.2.0...v0.2.1) (2026-11-03)


### Performance Improvements

* **enrich:** reuse known artist and album tags across tracks ([#102](https://github.com/Doggo785/ListFM/issues/102)) ([5f98c28](https://github.com/Doggo785/ListFM/commit/5f98c287b07d3290ac636f419f2775e65afa3135))
* **profile:** fetch the Last.fm profile once per page load ([#103](https://github.com/Doggo785/ListFM/issues/103)) ([2c4d887](https://github.com/Doggo785/ListFM/commit/2c4d88797cc2344b53d9b812c68160e29f494246))

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
