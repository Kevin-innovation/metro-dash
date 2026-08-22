# MetroDash generated asset 대응표 v1

이 문서는 현재 코드의 프리미티브/절차 텍스처 대상과 생성 이미지 후보의 대응을 기록한다. Phase 5 전까지는 시각 자산만 확정하며, 런타임 연결은 보류한다.

## 확정된 게임 오브젝트

| 코드 대상 | 논리 ID | 생성 자산 | 상태 |
| --- | --- | --- | --- |
| `makeTrain` | `train` | `objects/train/train-rear-3q-v1.png` | RGBA 확정 |
| `makeBus` | `bus` | `objects/bus/bus-oncoming-front-3q-v1.png` | RGBA 확정; 접근 방향 전용 |
| `makeBarrier` | `barrier` | `objects/obstacles/barrier-jump-v1.png` | RGBA 확정; 점프 전용 |
| `makeSign` | `sign` | `objects/obstacles/slide-gate-v1.png` | RGBA 확정; 슬라이드 전용 |
| `makeCrate` | `crate` | `objects/obstacles/crate-v1.png` | RGBA 확정; 점프 전용 |
| `makeCoin` | `coin` | `objects/collectibles/coin-v1.png` | RGBA 확정 |
| `makeMagnet` | `magnet` | `objects/powerups/magnet-v1.png` | RGBA 확정 |
| `makeJetpack` | `jetpack` | `objects/powerups/jetpack-v1.png` | RGBA 확정 |
| `makeDouble` | `double` | `objects/powerups/double-v1.png` | RGBA 확정 |
| `makeSneakers` | `sneakers` | `objects/powerups/sneakers-v1.png` | RGBA 확정 |

## 확정된 캐릭터 자산

| 코드 대상 | 논리 ID/상태 | 생성 자산 | 규칙 |
| --- | --- | --- | --- |
| `src/player.js`의 Kai root/limb model | `kai` | `character/kai/character-kai-master-v2-rear.png` | 후방 3/4 마스터 |
| Kai pose states | `run`, `jump`, `slide`, `mount`, `boarding`, `flying` | `character/kai/character-kai-*-rear-v1.png` | 관절 각도만 변경; 헤어·의상·배낭·비율 고정 |

## 환경 자산 후보

| 코드 대상 | 생성 자산 | 사용 의도 | 상태 |
| --- | --- | --- | --- |
| `makeFacade` / skyline building boxes | `environment/buildings/apartment-tower-3q-v1.png` | 반복 배치되는 아파트 시각 기준 | opaque RGB 후보 |
| `makeSky` + `makeClouds` + building recycle | `environment/city/city-skyline-panorama-v1.png` | 넓은 도시 배경·소실점 기준 | opaque RGB 후보 |
| `createWorld` tunnel shell/mouth | `environment/tunnel/tunnel-mouth-3q-v1.png` | 터널 진입 연출 기준 | opaque RGB 후보 |
| track segments / retaining wall | `environment/track/elevated-track-deck-v1.png` | 3레인 트랙·벽 livery 기준 | opaque RGB 후보 |
| `createWorld` pole loop | `environment/props/streetlamp-v1.png` | 반복 배치 가로등 prop | RGBA 확정 |

## 방향·렌더링 규칙

- 메인 플레이 카메라는 캐릭터 후방 3/4 추적 시점이다.
- 접근하는 버스는 전면 유리창과 흰색 헤드라이트를 사용한다. 후면 유리창과 빨간 테일램프는 멀어지는 차량에만 사용한다.
- 캐릭터 포즈는 관절만 바꾼다. identity, 헤어, 의상, 배낭, 색, 비율, 카메라, 조명은 고정한다.
- 생성 이미지의 충돌·풀링·논리 ID는 기존 `src/specs.js`와 `src/entities.js`를 기준으로 유지한다.
- RGBA 컷아웃은 실제 alpha 채널을 가져야 하며 검은색/색상 매트를 사용할 수 없다.
- 환경 RGB 후보는 배경/재질 기준 자산이며, Phase 5에서 실제 Three.js mesh/texture/billboard 사용 여부를 결정한다.
