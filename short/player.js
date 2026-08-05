(() => {
  const stage = document.getElementById("stage");
  const audio = document.getElementById("audio");
  const playHint = document.getElementById("playHint");
  const heartBurst = document.getElementById("heartBurst");
  const commentSheet = document.getElementById("commentSheet");
  const commentList = document.getElementById("commentList");
  const commentForm = document.getElementById("commentForm");
  const commentInput = document.getElementById("commentInput");
  const commentSubmit = commentForm.querySelector(".comment-submit");
  const likeBtn = stage.querySelector('[data-action="like"]');
  const likeCountEl = stage.querySelector("[data-like-count]");
  const commentCountEls = stage.querySelectorAll("[data-comment-count]");
  const followBtn = stage.querySelector(".follow");
  const musicTitle = stage.querySelector(".music-title");

  const HEART_SVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20.5s-7.2-4.35-9.3-8.55C1.2 9.2 2.4 6 5.55 6c1.8 0 3.15 1.05 3.9 2.25C10.2 7.05 11.55 6 13.35 6c3.15 0 4.35 3.2 2.85 5.95C16.1 16.15 12 20.5 12 20.5z" fill="currentColor"/>
    </svg>
  `;

  const HEART_COLORS = [
    "#FF4FE2",
    "#F481D7",
    "#FF6BCB",
    "#A875FD",
    "#FF8AE8",
    "#FFFFFF",
    "#5CE1FF",
  ];

  let liked = false;
  let likeCount = 112000;
  let commentCount = 3187;
  let hintTimer = null;

  const comments = [
    {
      user: "alley_fox",
      text: "헤드폰 네온 미쳤다…",
      time: "2시간",
      avatar: "neoncat.jpg",
    },
    {
      user: "bassline_kim",
      text: "이 비트 루프 어디 거야?",
      time: "5시간",
      avatar: "neoncat.jpg",
    },
    {
      user: "rainy_deck",
      text: "옥상 세트 분위기 최고",
      time: "1일",
      avatar: "neoncat.jpg",
    },
  ];

  function formatLikeCount(n) {
    if (n >= 10000) {
      const man = (n / 10000).toFixed(1).replace(/\.0$/, "");
      return `${man}만`;
    }
    return String(n);
  }

  function formatCommentCount(n) {
    return n.toLocaleString("ko-KR");
  }

  function syncCommentCounts() {
    const label = formatCommentCount(commentCount);
    commentCountEls.forEach((el) => {
      el.textContent = label;
    });
  }

  function showHintBriefly() {
    playHint.classList.add("is-visible");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      playHint.classList.remove("is-visible");
    }, 700);
  }

  async function toggleAudio() {
    try {
      if (audio.paused) {
        await audio.play();
        stage.classList.add("is-playing");
        stage
          .querySelectorAll('[data-action="toggle-audio"]')
          .forEach((el) => el.setAttribute("aria-pressed", "true"));
        playHint.classList.remove("is-visible");
      } else {
        audio.pause();
        stage.classList.remove("is-playing");
        stage
          .querySelectorAll('[data-action="toggle-audio"]')
          .forEach((el) => el.setAttribute("aria-pressed", "false"));
        showHintBriefly();
      }
    } catch {
      showHintBriefly();
    }
  }

  function spawnHeartBurst(originEl) {
    const stageRect = stage.getBoundingClientRect();
    let ox = stageRect.width * 0.5;
    let oy = stageRect.height * 0.42;

    if (originEl) {
      const r = originEl.getBoundingClientRect();
      ox = r.left + r.width / 2 - stageRect.left;
      oy = r.top + r.height / 2 - stageRect.top;
    }

    const count = 20 + Math.floor(Math.random() * 8);

    for (let i = 0; i < count; i++) {
      const heart = document.createElement("span");
      heart.className = "burst-heart";
      heart.innerHTML = HEART_SVG;

      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.55;
      const dist = 70 + Math.random() * 160;
      const dx = Math.cos(angle) * dist + (Math.random() - 0.5) * 40;
      const dy = Math.sin(angle) * dist * 0.85 - 40 - Math.random() * 120;
      const size = 16 + Math.random() * 28;
      const rot = `${(Math.random() * 70 - 35).toFixed(1)}deg`;
      const dur = `${0.85 + Math.random() * 0.55}s`;
      const delay = `${Math.random() * 0.12}s`;
      const color = HEART_COLORS[i % HEART_COLORS.length];
      const jitterX = (Math.random() - 0.5) * 36;
      const jitterY = (Math.random() - 0.5) * 28;

      heart.style.setProperty("--x", `${ox + jitterX}px`);
      heart.style.setProperty("--y", `${oy + jitterY}px`);
      heart.style.setProperty("--dx", `${dx.toFixed(1)}px`);
      heart.style.setProperty("--dy", `${dy.toFixed(1)}px`);
      heart.style.setProperty("--size", `${size.toFixed(1)}px`);
      heart.style.setProperty("--rot", rot);
      heart.style.setProperty("--dur", dur);
      heart.style.setProperty("--delay", delay);
      heart.style.setProperty("--heart-color", color);

      heartBurst.appendChild(heart);
      heart.addEventListener("animationend", () => heart.remove(), { once: true });
    }
  }

  function setLiked(nextLiked, { burst = false, originEl = likeBtn } = {}) {
    if (nextLiked && !liked) {
      likeCount += 1;
    } else if (!nextLiked && liked) {
      likeCount -= 1;
    }

    liked = nextLiked;
    likeBtn.classList.toggle("is-active", liked);
    likeBtn.setAttribute("aria-pressed", String(liked));
    likeCountEl.textContent = formatLikeCount(likeCount);

    likeBtn.classList.remove("pop");
    void likeBtn.offsetWidth;
    likeBtn.classList.add("pop");

    if (burst) {
      spawnHeartBurst(originEl);
    }
  }

  function onLikeButton() {
    if (liked) {
      // 이미 좋아요 → 언라이크 (버스트 없음)
      setLiked(false);
    } else {
      setLiked(true, {
        burst: true,
        originEl: likeBtn.querySelector(".action-icon") || likeBtn,
      });
    }
  }

  function onDoubleTapLike() {
    setLiked(true, { burst: true, originEl: null });
  }

  function toggleFollow() {
    const on = followBtn.getAttribute("aria-pressed") !== "true";
    followBtn.setAttribute("aria-pressed", String(on));
    followBtn.textContent = on ? "Following" : "Follow";
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderComments() {
    if (!comments.length) {
      commentList.innerHTML = `<li class="comment-empty">첫 댓글을 남겨보세요</li>`;
      return;
    }

    commentList.innerHTML = comments
      .map(
        (c) => `
      <li class="comment-item">
        <img class="comment-item-avatar" src="${c.avatar}" alt="" />
        <div class="comment-item-body">
          <div class="comment-item-meta">
            <span class="comment-item-user">@${c.user}</span>
            <span class="comment-item-time">${c.time}</span>
          </div>
          <p class="comment-item-text">${escapeHtml(c.text)}</p>
        </div>
      </li>`
      )
      .join("");
  }

  function openComments() {
    commentSheet.hidden = false;
    stage.classList.add("comments-open");
    renderComments();
    syncCommentCounts();
    requestAnimationFrame(() => commentInput.focus());
  }

  function closeComments() {
    commentSheet.hidden = true;
    stage.classList.remove("comments-open");
    commentInput.blur();
  }

  function addComment(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    comments.unshift({
      user: "you",
      text: trimmed,
      time: "방금",
      avatar: "neoncat.jpg",
    });
    commentCount += 1;
    syncCommentCounts();
    renderComments();
    commentList.scrollTop = 0;
  }

  if (musicTitle) {
    musicTitle.textContent = `${musicTitle.textContent} · ${musicTitle.textContent}`;
  }

  syncCommentCounts();
  renderComments();

  stage.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target || !stage.contains(target)) return;

    const action = target.getAttribute("data-action");
    event.stopPropagation();

    switch (action) {
      case "toggle-audio":
        if (stage.classList.contains("comments-open")) return;
        toggleAudio();
        break;
      case "like":
        onLikeButton();
        break;
      case "comment":
        openComments();
        break;
      case "close-comments":
        closeComments();
        break;
      default:
        break;
    }
  });

  followBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFollow();
  });

  commentInput.addEventListener("input", () => {
    commentSubmit.disabled = commentInput.value.trim().length === 0;
  });

  commentForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addComment(commentInput.value);
    commentInput.value = "";
    commentSubmit.disabled = true;
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !commentSheet.hidden) {
      closeComments();
    }
  });

  let lastTap = 0;
  stage.querySelector(".tap-layer")?.addEventListener(
    "click",
    (e) => {
      if (stage.classList.contains("comments-open")) return;
      const now = Date.now();
      if (now - lastTap < 280) {
        e.stopPropagation();
        e.preventDefault();
        onDoubleTapLike();
        lastTap = 0;
        return;
      }
      lastTap = now;
    },
    true
  );

  audio.addEventListener("pause", () => {
    stage.classList.remove("is-playing");
  });

  audio.addEventListener("play", () => {
    stage.classList.add("is-playing");
  });

  showHintBriefly();
})();
