/**
 * What version this is, and what changed in each one.
 *
 * The numbering is MAJOR.MINOR with the minor as two digits: a small fix moves
 * it by one (2.00 → 2.01), a patch worth telling people about moves the first
 * digit of the pair (2.09 → 2.10), and a release that changes what the game is
 * takes the whole number (2.90 → 3.00).
 *
 * The notes are written for whoever is playing, not for whoever is committing.
 * "게이트+차량 줄 판정 수정" is a true description of a change and tells a
 * student nothing; "게이트 뒤에 바로 버스가 서 있어 피할 수 없던 배치를
 * 없앴어요" is the same change described from the seat they are sitting in.
 */
export const VERSION = "2.00";

/**
 * Newest first. `date` is the day it went out, `title` is the one line that
 * says why anyone should care, and `notes` are the things a player can go and
 * do differently because of it.
 *
 * `kind` colours the entry: "major" for a release that adds something to do,
 * "minor" for one that adds to what is already there, "fix" for one that only
 * takes problems away.
 */
export const CHANGELOG = [
  {
    version: "2.00",
    date: "2026-08-29",
    kind: "major",
    title: "까마귀 알 · 해독제 · 캐릭터 4종",
    notes: [
      "코인 줄 한가운데 검은 알이 놓이기 시작했어요. 먹으면 까마귀가 4.5초 동안 뒤에 달라붙어 쪼고, 그동안 앞이 어둡고 뿌옇게 보입니다. 레인을 바꾸거나 점프로 넘어서 피하세요 — 옆 레인에도 코인을 깔아 뒀으니 피하는 쪽이 손해는 아닙니다.",
      "상점 · 아이템에 까마귀 해독제가 생겼어요. 5,000코인. 가지고 있으면 까마귀 알을 먹어도 한 번은 막아 주고, 막으면서 사라집니다. 호버보드처럼 한 번에 하나만 가질 수 있어요.",
      "캐릭터가 4종 늘었습니다. 환경미화원(24,000)은 호버보드가 40% 오래가고, 육상부(40,000)는 콤보가 50% 더 오래 유지되며, 역무원(60,000)은 획득 XP가 25% 늘어납니다. 허수아비(75,000)는 까마귀가 붙어 있는 시간이 30% 짧고 화면도 절반만 흐려집니다 — 상점에서 가장 비쌉니다.",
      "호버보드 값이 350코인에서 3,000코인으로 올랐어요. 한 판에 한 번 충돌을 막아 주는 물건이라, 사실상 공짜였던 값을 제자리로 돌렸습니다.",
      "타이틀 화면에 버전과 패치노트 버튼이 생겼어요. 지금 보고 계신 것이 그것입니다.",
    ],
  },
  {
    version: "1.31",
    date: "2026-08-29",
    kind: "fix",
    title: "플레이 화면을 덮던 HUD 정리",
    notes: [
      "파워업을 여러 개 동시에 먹으면 이름표가 한 줄씩 세로로 쌓여 트랙을 다 가렸어요. 이제 아이콘과 남은 시간 막대만 가로 한 줄로 놓입니다.",
      "게임오버 카드가 13인치 노트북에서 스크롤해야 보이던 것을 두 단으로 나눠 한 화면에 담았습니다.",
    ],
  },
  {
    version: "1.30",
    date: "2026-08-24",
    kind: "minor",
    title: "레벨 99까지",
    notes: [
      "레벨 상한이 크게 늘어 오래 달릴수록 계속 올라갑니다.",
      "선생님이 오프라인에서 나온 점수를 직접 기록해 줄 수 있게 됐어요.",
      "리더보드 레벨 탭에 XP 단위를 표시했습니다.",
    ],
  },
  {
    version: "1.20",
    date: "2026-08-22",
    kind: "major",
    title: "명예의 전당 · 학교 랭킹",
    notes: [
      "학교끼리도 주간 순위를 겨룹니다. 내 점수가 우리 학교 점수가 돼요.",
      "역대 최고 기록을 모아 두는 명예의 전당이 생겼습니다.",
      "리더보드에 레벨 탭이 생기고, 순위 옆에 레벨이 함께 나옵니다. 더보기로 10위씩 넘겨 볼 수 있어요.",
      "게임오버 화면에서 바로 리더보드를 열 수 있습니다.",
      "최고 점수가 기기를 옮겨 다녀도 따라옵니다. 메인 화면도 한눈에 들어오게 다시 짰어요.",
      "슈퍼 스니커즈로도 게이트는 넘을 수 없게 하고, 제트팩은 아래로 눌러 먼저 내려올 수 있게 했습니다. 터널 입구가 미리 보입니다.",
    ],
  },
  {
    version: "1.10",
    date: "2026-08-20",
    kind: "major",
    title: "구간 이벤트 · 일일 미션",
    notes: [
      "15초 동안 트랙이 하나의 주제로 바뀌는 구간이 생겼어요. 코인 러시, 게이트 구간처럼 그동안 할 일이 달라지고 점수 배율도 붙습니다.",
      "매일 미션 3개가 주어집니다. 3개를 모두 끝내면 보너스 코인과 XP를 더 받아요.",
      "캐릭터가 3종 늘고, 저마다 하나씩 능력이 붙었습니다.",
      "제트팩을 타면 하늘에 코인 줄이 실제로 생깁니다. 땅의 코인은 안전한 레인이 아니라 위험한 레인에 놓이도록 바꿨어요.",
      "피할 방법이 아예 없는 장애물 배치를 자동으로 찾아 없애는 검사를 넣었습니다. 게이트 바로 뒤에 차량이 서 있어 죽을 수밖에 없던 자리가 사라졌어요.",
      "리더보드가 실시간으로 갱신되고, 새 버전이 올라오면 알려 줍니다.",
    ],
  },
  {
    version: "1.00",
    date: "2026-08-19",
    kind: "major",
    title: "첫 공개",
    notes: [
      "3개 레인을 달리며 지하철과 버스를 피하는 끝없는 러너. 좌우로 레인 변경, 위로 점프, 아래로 슬라이드.",
      "주간 리더보드가 열렸습니다. 매주 순위가 새로 시작해요.",
      "코인을 모아 상점에서 파워업을 강화하고 캐릭터를 삽니다.",
      "매일 접속하면 연속 출석 보상이 쌓입니다.",
      "달릴수록 빨라지고, 4만 점을 넘겨도 난이도가 계속 올라갑니다.",
    ],
  },
];

/** The entry being played right now, for the title badge. */
export function currentRelease() {
  return CHANGELOG.find((entry) => entry.version === VERSION) ?? CHANGELOG[0];
}
