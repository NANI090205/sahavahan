(function () {
  // Fix: some browsers/environments may not define Offline/Network globals.
  // Ensure code that checks offline state won't crash.
  try {
    if (typeof Offline === 'undefined') window.Offline = undefined;
  } catch {}

  const username = localStorage.getItem("username");
  if (!username) return;

  const DRAWER_ID = "notificationDrawer";
  const LIST_ID = "notificationList";

  function iconForType(type) {
    switch (type) {
      case "booking":
        return "🎫";
      case "ride_published":
        return "🔔";
      case "cancellation":
        return "⚠️";
      case "review":
        return "⭐";
      case "message":
        return "💬";
      default:
        return "🔔";
    }
  }

  function formatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "<")
      .replaceAll(">", ">")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ensureStylesAndDrawer() {
    if (document.getElementById(DRAWER_ID)) return;

    const drawer = document.createElement("div");
    drawer.id = DRAWER_ID;
    drawer.className = "notification-drawer";
    drawer.innerHTML = `
      <div class="notification-drawer-header">
        <h3>Notifications</h3>
        <div class="notification-drawer-actions">
          <button class="notification-mark-all" type="button">Mark all as read</button>
          <button class="notification-view-all" type="button" title="Open full history">View all</button>
        </div>
      </div>
      <div id="${LIST_ID}" class="notification-drawer-list"></div>
    `;
    document.body.appendChild(drawer);

    const style = document.createElement("style");
    style.textContent = `
      .notification-bell-wrap{ position:fixed; top:16px; right:16px; z-index:9999; }
      .notification-bell{ position:relative; font-size:26px; cursor:pointer; user-select:none; background:#263238; color:#fff; border-radius:999px; padding:10px 14px; box-shadow: 0 4px 12px rgba(0,0,0,.18); display:inline-flex; align-items:center; justify-content:center; }
      #notificationCount{ position:absolute; top:-8px; right:-8px; background:red; color:white; width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:800; }

      .notification-drawer{ position:fixed; top:0; right:0; height:100vh; width:380px; max-width:92vw; background:#fff; z-index:10000; transform: translateX(110%); transition: transform .25s ease; box-shadow: -12px 0 40px rgba(0,0,0,.2); display:flex; flex-direction:column; border-left: 1px solid #e9eef3; }
      .notification-drawer.open{ transform: translateX(0%); }
      .notification-drawer-header{ padding:14px 16px; border-bottom:1px solid #e9eef3; background:#f6f8fb; display:flex; align-items:center; justify-content:space-between; gap:10px; }
      .notification-drawer-header h3{ margin:0; font-size:16px; }
      .notification-drawer-actions{ display:flex; gap:8px; align-items:center; }
      .notification-mark-all{ border:1px solid #d9e2ef; background:#fff; padding:8px 10px; border-radius:10px; font-weight:700; cursor:pointer; font-size:12px; }
      .notification-view-all{ border:0; background:#263238; color:#fff; padding:8px 10px; border-radius:10px; font-weight:800; cursor:pointer; font-size:12px; }
      .notification-drawer-list{ padding:8px 12px; overflow:auto; flex:1; }
      .notification-card{ padding:12px 12px; border-radius:12px; border:1px solid #eef2f6; margin-bottom:10px; cursor:pointer; background:#fff; }
      .notification-card.unread{ border-left:4px solid #e91e63; background:#fff7fb; }
      .notification-card.read{ border-left:4px solid #c7d1db; background:#fff; }
      .notification-card-title{ font-weight:900; margin-bottom:4px; font-size:13px; }
      .notification-card-message{ color:#444; font-size:13px; line-height:1.35; margin-bottom:8px; }
      .notification-card-time{ font-size:12px; color:#7b8b9a; font-weight:700; }
      .notification-empty{ padding:18px 6px; text-align:center; color:#7b8b9a; font-weight:700; }
      @media (max-width:520px){ .notification-drawer{ width:92vw; } }
    `;
    document.head.appendChild(style);

    const markAllBtn = drawer.querySelector(".notification-mark-all");
    const viewAllBtn = drawer.querySelector(".notification-view-all");

    markAllBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await fetch(`/api/notifications/read-all/${encodeURIComponent(username)}`, {
        method: "PATCH",
      });
      await loadNotifications();
      await loadNotificationCount();
    });

    viewAllBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      window.location.href = "notifications.html";
    });
  }

  function ensureBellButton() {
    if (document.getElementById("notificationBellButton")) return;

    const wrap = document.createElement("div");
    wrap.className = "notification-bell-wrap";

    const bell = document.createElement("div");
    bell.id = "notificationBellButton";
    bell.className = "notification-bell";
    bell.setAttribute("role", "button");
    bell.setAttribute("tabindex", "0");
    bell.innerHTML = `🔔 <span id="notificationCount">0</span>`;

    const toggle = () => {
      ensureStylesAndDrawer();
      const drawer = document.getElementById(DRAWER_ID);
      drawer.classList.toggle("open");
      if (drawer.classList.contains("open")) loadNotifications();
    };

    bell.addEventListener("click", (e) => {
      e.stopPropagation();
      toggle();
    });

    bell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });

    document.addEventListener("click", () => {
      const drawer = document.getElementById(DRAWER_ID);
      if (drawer) drawer.classList.remove("open");
    });

    wrap.appendChild(bell);
    document.body.appendChild(wrap);
  }

  async function loadNotificationCount() {
    try {
      const response = await fetch(
        `/api/notifications/count/${encodeURIComponent(username)}`
      );
      const data = await response.json();
      const countEl = document.getElementById("notificationCount");
      if (countEl) countEl.innerText = data.count || 0;
    } catch (error) {
      console.error("Notification count error:", error);
    }
  }

  async function loadNotifications() {
    const list = document.getElementById(LIST_ID);
    if (!list) return;

    list.innerHTML = `<div class="notification-empty">Loading...</div>`;

    try {
      const response = await fetch(
        `/api/notifications/${encodeURIComponent(username)}`
      );
      const data = await response.json();
      const notifications = Array.isArray(data)
        ? data
        : data.notifications || [];

      if (!notifications.length) {
        list.innerHTML = `<div class="notification-empty">No notifications yet.</div>`;
        return;
      }

      list.innerHTML = notifications
        .slice(0, 30)
        .map((n) => {
          const isUnread = !n.isRead;
          const icon = iconForType(n.type);
          return `
            <div class="notification-card ${isUnread ? "unread" : "read"}" data-id="${n._id}">
              <div class="notification-card-title">${icon} ${escapeHtml(n.title || "Notification")}</div>
              <div class="notification-card-message">${escapeHtml(n.message || "")}</div>
              <div class="notification-card-time">${formatTime(n.createdAt)}</div>
            </div>
          `;
        })
        .join("");

      list.querySelectorAll(".notification-card").forEach((card) => {
        card.addEventListener("click", async (e) => {
          e.stopPropagation();
          const id = card.getAttribute("data-id");
          if (!id) return;
          await fetch(`/api/notifications/read/${id}`, { method: "PUT" });
          await loadNotifications();
          await loadNotificationCount();
        });
      });
    } catch (error) {
      console.error("Notification load error:", error);
      list.innerHTML = `<div class="notification-empty">Failed to load notifications.</div>`;
    }
  }

  function maybeInitSocket() {
    if (typeof io === "undefined") return;

    const socket = io();
    socket.on("connect", () => {
      socket.emit("userJoinNotifications", { username });
    });

    socket.on("newNotification", async () => {
      await loadNotificationCount();
      const drawer = document.getElementById(DRAWER_ID);
      if (drawer && drawer.classList.contains("open")) {
        await loadNotifications();
      }
    });
  }

  ensureStylesAndDrawer();
  ensureBellButton();

  const init = async () => {
    await loadNotificationCount();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  setInterval(loadNotificationCount, 10000);
  maybeInitSocket();
})();

