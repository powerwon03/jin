# 생일축하해 유진아 🎂

유진이 생일 축하 화면 + 지원이랑 유진이 둘만 쓰는 교환일기 + 지원이 줘패기 게임.

## 기능

- 생일 화면 (사진 누르면 꽃가루)
- 교환일기: 글 + 사진(4장) + 오늘 기분, 전체 / 지원 / 유진 탭으로 나눠 보기
- 지원이 줘패기: 30초 동안 튀어나오는 지원이를 방망이로 때리는 게임. 각자 최고 점수 저장
- 아이폰: 하단 탭바, 홈 화면에 추가하면 앱처럼 열림

로그인은 **지원 / 유진** 을 고르고 **전화번호 뒷자리 4개**. 5번 틀리면 5분 잠겨요.

---

## 🚀 Vercel에 올리기 (링크 만들기)

### 1. GitHub에 올리기

1. 저장소: https://github.com/powerwon03/jin (이미 올려둠)
   - 새로 만들 때만: https://github.com/new
   - 이름: `yujin-diary` (아무거나)
   - **Private(비공개)** 로 만들기 ← 사진이 들어 있어서 꼭!
2. 이 폴더에서:

```bash
git remote add origin https://github.com/<내아이디>/yujin-diary.git
git push -u origin main
```

### 2. Vercel에서 가져오기

1. https://vercel.com/new 에서 GitHub로 로그인
2. 방금 만든 `yujin-diary` 저장소 **Import**
3. Framework Preset은 **Other** 그대로, 나머지도 그대로 두고 **Deploy**

### 3. 저장 공간 연결 (일기·사진·점수 저장용) — 둘 중 하나

**A. Supabase (추천, 이미 프로젝트 있음)**

Vercel 프로젝트 → **Settings → Environment Variables** 에 추가:

| 이름 | 값 |
| --- | --- |
| `SUPABASE_URL` | `https://txenphpzsjzkffzgrywu.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys 의 **service_role** (secret) 키 |

처음 쓸 때 `yujin-diary` 라는 **비공개** 버킷이 자동으로 만들어져요.
service_role 키는 비밀이에요. 코드나 GitHub에 절대 넣지 말고 Vercel 환경변수에만 넣어주세요.

**B. Vercel Blob**

1. Vercel 프로젝트 → **Storage** 탭 → **Create** → **Blob**
2. 접근 방식은 **Private** 선택 → 만들고 이 프로젝트에 **Connect**
   (그러면 `BLOB_READ_WRITE_TOKEN` 이 자동으로 들어가요)

### 4. 로그인 번호 넣기

프로젝트 → **Settings → Environment Variables** 에 3개 추가:

| 이름 | 값 |
| --- | --- |
| `JIWON_PIN` | 지원이 전화번호 뒷자리 4개 |
| `YUJIN_PIN` | 유진이 전화번호 뒷자리 4개 |
| `SESSION_SECRET` | 아무 긴 랜덤 글자 (예: 키보드 막 친 40글자) |

### 5. 다시 배포

**Deployments** 탭 → 맨 위 배포 → **⋯ → Redeploy**.
끝나면 `https://yujin-diary-xxxx.vercel.app` 같은 링크가 생겨요. 이걸 유진이한테 보내면 돼요.

> 생일 화면은 링크만 있으면 누구나 볼 수 있어요. 일기·사진·게임은 로그인해야 보여요.

---

## 💻 내 컴퓨터에서 실행

```bash
npm start
```

http://localhost:3000 . 로그인 번호는 `config.json` (처음 실행하면 자동 생성)에서 바꿔요.
내 컴퓨터에서는 일기·사진이 `data/` 폴더에 저장되고, 배포하면 Supabase Storage 또는 Vercel Blob(비공개)에 저장돼요.
(내 컴퓨터에 쓴 일기는 Vercel로 자동으로 옮겨지지 않아요.)

## 파일 구조

- `public/` 화면 (HTML, CSS, JS, 사진)
- `lib/handler.js` 로그인·일기·사진·점수 API
- `lib/store.js` 저장소 (내 컴퓨터: `data/`, 배포: Supabase Storage 또는 Vercel Blob)
- `lib/config.js` 로그인 번호 (Vercel: 환경변수, 내 컴퓨터: `config.json`)
- `api/index.js` Vercel 서버리스 함수
- `server.js` 내 컴퓨터용 서버

이모지는 어느 기기에서 봐도 아이폰 이모지로 보이도록 Apple 이모지 이미지(emoji-datasource-apple)를 써요.
