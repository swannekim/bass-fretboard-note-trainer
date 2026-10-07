# Bass Fretboard Note Trainer

[English](README.md) | **한국어**

4현 베이스(표준 튜닝 E·A·D·G) 지판 연습 앱이에요. 휴대폰을 가로로 눕혀서 쓰도록 만들었고, 탭이 세 개 있어요.

| 탭 | 주소 | 하는 일 |
|---|---|---|
| 지판 | `/` | 줄·프렛을 누르면 그 음이 소리 나요 |
| 퀴즈 | `/quiz` | 음이름을 보고 지판에서 위치를 찾아요 |
| 조율 | `/tuner` | 마이크로 개방현 E·A·D·G 음정을 맞춰요 |

## 기능

### 지판
- 연주자가 내려다보는 방향: 맨 위 1번줄 G → 맨 아래 4번줄 E. 너트는 왼쪽이고 **좌우 반전**으로 바꿀 수 있어요.
- 개방현 + 1–12프렛. 누르면 그 음을 브라우저에서 합성해 들려줘요(Karplus–Strong 방식, 오디오 파일 없음). 여러 손가락으로 동시에 눌러도 돼요.
- 라벨: 자연음 → 전체 ♯♭ → 숨김. 임시표는 ♯ 이름을 위, ♭ 이름을 아래에 함께 표시해요(예: C♯ / D♭).
- 누를 때마다 위쪽에 "A · 3번줄 5프렛"처럼 답이 나와요.
- **옥타브 ↑**(휴대폰 스피커용), **전체화면**.

### 퀴즈
- 라벨을 숨긴 지판에서, 화면에 뜬 음이름의 자리를 찾아 눌러요.
- 설정: 범위(0–5 / 0–12프렛), 음(7음 전체 / E·F·G / A·B·C), 문제 수(7 / 10 / 20), 타이머 표시.
- 채점: 3초 안에 맞히면 ◎, 3초가 넘으면 ○, 틀리면 X. 같은 음이면 어느 자리를 눌러도 정답이에요.
- 틀리면 대표 위치를 3번 누른 뒤 넘어가고, 그 음은 몇 문제 뒤 다시 나와요.
- 결과: ◎/○/X 개수, 평균 시간, 목표(10문제 기준 ◎ 5개 이상) 달성 여부, 음별 결과표, 더 연습할 음, **틀린 음만 다시**.
- 대표 위치: E 4번줄 개방 · F 4번줄 1프렛 · G 4번줄 3프렛 · A 3번줄 개방 · B 3번줄 2프렛 · C 3번줄 3프렛 · D 2번줄 개방.

### 조율
- 튕긴 줄을 자동으로 찾아요. 줄 이름을 누르면 그 줄만 듣도록 고정돼요(많이 풀린 줄을 맞출 때).
- 바늘 미터(±50센트): 가운데 초록 ±5센트, 노랑 ±25센트, 그 밖은 빨강.
- 낮으면 **올리세요**(줄을 조이세요), 높으면 **내리세요**(줄을 푸세요).
- ±5센트 안에 0.7초 머물면 그 줄 **통과**. 4줄 모두 통과하면 알려줘요.
- 줄마다 기준음 버튼이 있어요. 기준음이 나는 동안은 휴대폰 자기 소리를 판정하지 않도록 잠깐 듣기를 멈춰요.
- 음정 검출은 YIN 알고리즘이에요. 휴대폰 마이크가 잘 못 잡는 저음 E(41 Hz)도 배음으로 계산해요.
- 마이크는 버튼을 눌렀을 때만 켜지고, **마이크 끄기**를 누르거나 다른 탭으로 가면 꺼져요.

## 실행 방법

필요한 것: Node.js 20.19 이상(22 LTS 권장)

```bash
npm install
npm run dev
```

터미널에 나오는 주소(기본 http://127.0.0.1:5173)를 브라우저에서 열면 돼요. 5173 포트를 다른 프로그램이 쓰고 있으면 시작되지 않으니, 그때는 `npm run dev -- --port 5174`처럼 다른 포트를 지정하세요.

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 (코드를 고치면 바로 반영) |
| `npm run build` | 배포용 파일을 `dist/`에 만들기 |
| `npm run build:pages` | GitHub Pages용 파일을 `dist/`에 만들기 (해시 라우팅) |
| `npm run preview` | 만든 `dist/`를 미리 보기 |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | 코드 스타일 검사 |

`npm run check`(타입·빌드·스타일 검사를 한 번에)는 [Bun](https://bun.sh)이 설치돼 있어야 돼요.

### 휴대폰에서 쓰려면
- PC와 휴대폰이 같은 Wi-Fi일 때 `npm run dev -- --host`로 띄우고, 휴대폰에서 터미널에 나온 Network 주소를 열면 지판·퀴즈를 바로 써볼 수 있어요.
- **조율 탭의 마이크는 HTTPS 주소(또는 localhost)에서만 켜져요.** 휴대폰에서 조율까지 쓰려면 HTTPS로 배포하세요.
- 일반 빌드(`npm run build`)를 배포할 때는 `/quiz`, `/tuner` 주소로 바로 들어오거나 새로고침해도 열리도록, 모든 경로를 `index.html`로 돌려주는 설정(호스팅 서비스의 SPA / rewrite 설정)을 켜 주세요. GitHub Pages용 빌드는 아래처럼 별도로 제공해요.

### GitHub Pages

npm은 빌드할 때만 필요해요. GitHub Pages에는 완성된 HTML·CSS·JavaScript만 올라가며, 별도 Node.js 서버나 Bun은 필요하지 않아요.

- 사이트: https://swannekim.github.io/bass-fretboard-note-trainer/
- 퀴즈: https://swannekim.github.io/bass-fretboard-note-trainer/#/quiz
- 조율: https://swannekim.github.io/bass-fretboard-note-trainer/#/tuner

Pages 빌드는 `#/quiz`, `#/tuner`처럼 해시 라우팅을 사용해요. 링크를 직접 열거나 새로고침해도 서버 rewrite나 `404.html` 우회 없이 동작해요. HTTPS이므로 조율 탭에서 마이크 권한을 허용하면 마이크를 사용할 수 있어요.

저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정하세요. `.github/workflows/deploy-pages.yml`이 `main`에 push할 때마다 npm 설치·타입 검사·Pages 빌드 후 `dist/`를 배포해요. **Actions → Deploy GitHub Pages → Run workflow**로 수동 배포도 가능해요.

로컬에서 Pages용 빌드를 미리 보려면:

```bash
npm ci
npm run build:pages
npm run preview -- --base=/bass-fretboard-note-trainer/
```

http://localhost:4173/bass-fretboard-note-trainer/ 에서 확인하세요. 자동 배포는 Pages 설정의 경로를 사용하고, 수동 빌드의 기본 경로는 `/bass-fretboard-note-trainer/`예요. 다른 경로는 Vite의 `--base` 옵션으로 지정할 수 있어요. 기존 `npm run dev`와 `npm run build`의 라우팅 방식은 그대로예요.

## 코드 구조

이 앱의 기능을 담은 파일:

| 파일 | 내용 |
|---|---|
| `src/pages/home.tsx` | 지판 탭 |
| `src/pages/quiz.tsx` | 퀴즈 탭 |
| `src/pages/tuner.tsx` | 조율 탭 |
| `src/components/fretboard.tsx` | 지판 그리기 · 터치 처리 · 칸 강조 |
| `src/components/trainer-tabs.tsx`, `src/components/pill.tsx` | 탭과 버튼 |
| `src/lib/fretboard.ts` | 줄·프렛·음 모델, ♯/♭ 표기, 배치 계산 |
| `src/lib/bass-audio.ts` | 베이스 소리 합성 |
| `src/lib/quiz.ts` | 퀴즈 규칙(대표 위치, 채점, 재출제, 결과) |
| `src/lib/pitch.ts` | 음정 검출(YIN) |
| `src/lib/tuner.ts` | 조율 판정(센트 계산, 바늘 안정화, 통과 조건) |
| `src/hooks/use-mic-tuner.ts` | 마이크 켜기 · 끄기 |
| `src/hooks/use-trainer-chrome.ts` | 어두운 화면 고정 · 가로/세로 감지 |
| `src/lib/store.ts` | 탭끼리 공유하는 설정(좌우 반전, 옥타브 등) |
| `src/lib/nav.ts`, `src/routes.tsx` | 탭 목록과 페이지 연결 |
| `src/index.css` | 색 · 테마 · 애니메이션 |

나머지(`src/components/ui/`, `src/lib/`의 다른 파일, `vite.config.ts`, `vite-dev-reload.ts` 등)는 앱 템플릿의 기본 구성이에요. 그중 일부는 이 앱을 처음 만든 미리보기·게시 환경과 연결하는 코드예요.

기술: React 19 · TypeScript · Vite 7 · Tailwind CSS 4 · Zustand · React Router 7 · lucide-react · Web Audio API

## License

Copyright (C) 2026 swannekim.

이 프로젝트의 자체 코드는 **GNU Affero General Public License version 3 only (`AGPL-3.0-only`)**로 제공합니다. 전체 조건은 [LICENSE](LICENSE)를 참고하세요.

- 라이선스에 따라 사용·수정·재배포할 수 있으며, 저작권·라이선스 고지를 유지해야 합니다.
- 배포 시 라이선스가 적용되는 코드의 해당 소스를 AGPL 조건에 따라 제공해야 합니다.
- 수정본을 네트워크를 통해 제공하면, 그 수정본과 상호작용하는 이용자에게 해당 소스를 받을 수 있는 방법을 제공해야 합니다.
- 프로그램은 **어떠한 보증도 없이** 제공됩니다. 정확한 권리·의무와 면책 범위는 라이선스 전문을 따릅니다.

원본 소스: https://github.com/swannekim/bass-fretboard-note-trainer

앱의 모든 탭에서 **소스 · AGPL** 링크로 소스와 라이선스를 확인할 수 있습니다. 포크한 수정본을 배포할 때는 `src/components/trainer-tabs.tsx`의 링크와 `vite.config.ts`의 소스 안내를 **실제로 제공하는 수정본의 해당 소스**로 변경하세요. 이 저장소를 가리키는 것만으로 수정본의 소스 제공 의무가 충족되지는 않습니다.

기존 템플릿·외부 라이브러리·폰트 등 제3자 구성요소의 기존 라이선스와 저작권 고지는 유지됩니다. 이 프로젝트의 라이선스가 제3자 구성요소의 원래 라이선스를 대체하지 않습니다. 빌드는 앱 라이선스(`LICENSE.txt`), Vite가 수집한 번들 의존성 고지(`THIRD_PARTY_LICENSES.txt`), Geist 폰트의 OFL 고지(`GEIST_LICENSE.txt`)를 `dist/`에 포함합니다.
