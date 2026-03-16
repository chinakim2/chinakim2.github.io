const STORAGE_KEY = "qing-plan-state";
const EXPORT_VERSION = 1;
const APP_CONFIG = window.QING_PLAN_CONFIG || {};
const FAMILY_PARAM_KEY = "family";
const APP_REVISION = "20260317-2";

let deferredInstallPrompt = null;
let syncSaveTimer = null;
let syncPollTimer = null;
let syncHydrating = false;
let toastTimer = null;
let childCountdownTimer = null;
let taskDragState = null;

const state = {
  profile: {
    childName: "",
    grade: "一年级",
    arrivalTime: "17:20",
    bedTime: "21:20",
    focusMinutes: 100,
    playMinutes: 40,
  },
  tasks: [],
  plan: [],
  generatedAt: null,
  currentTaskIndex: 0,
  security: {
    parentPin: "",
  },
  ui: {
    activeScreen: "today",
    childLocked: false,
  },
  sync: {
    familySlug: "",
    familySecret: "",
    lastSyncedAt: "",
    pending: false,
    status: "idle",
    message: "",
  },
};

const taskTypeMeta = {
  homework: { label: "学校作业", detail: "优先处理学校布置的内容" },
  review: { label: "自主复习", detail: "用短时段完成巩固和回顾" },
  habit: { label: "习惯养成", detail: "保持每天一点点" },
  class: { label: "兴趣班", detail: "建议按总占用时长填写，包含路上和接送时间" },
  routine: { label: "生活节奏", detail: "保留休息与自由时间" },
  break: { label: "休息", detail: "切换节奏，避免疲劳" },
};

const els = {
  appShell: document.querySelector("#appShell"),
  profileForm: document.querySelector("#profileForm"),
  focusMinutesValue: document.querySelector("#focusMinutesValue"),
  playMinutesValue: document.querySelector("#playMinutesValue"),
  taskForm: document.querySelector("#taskForm"),
  taskList: document.querySelector("#taskList"),
  taskDurationHint: document.querySelector("#taskDurationHint"),
  classTimeField: document.querySelector("#classTimeField"),
  generatePlan: document.querySelector("#generatePlan"),
  goInputShortcut: document.querySelector("#goInputShortcut"),
  goTodayShortcut: document.querySelector("#goTodayShortcut"),
  handoffShortcut: document.querySelector("#handoffShortcut"),
  handoffChildMode: document.querySelector("#handoffChildMode"),
  clearDay: document.querySelector("#clearDay"),
  timeline: document.querySelector("#timeline"),
  loadAlert: document.querySelector("#loadAlert"),
  mustCount: document.querySelector("#mustCount"),
  delayCount: document.querySelector("#delayCount"),
  focusUsed: document.querySelector("#focusUsed"),
  reviewCompletion: document.querySelector("#reviewCompletion"),
  reviewCompletionCopy: document.querySelector("#reviewCompletionCopy"),
  reviewSmooth: document.querySelector("#reviewSmooth"),
  reviewSmoothCopy: document.querySelector("#reviewSmoothCopy"),
  reviewAdvice: document.querySelector("#reviewAdvice"),
  reviewAdviceCopy: document.querySelector("#reviewAdviceCopy"),
  childGreeting: document.querySelector("#childGreeting"),
  childCurrent: document.querySelector("#childCurrent"),
  startTask: document.querySelector("#startTask"),
  completeTask: document.querySelector("#completeTask"),
  childModeCopy: document.querySelector("#childModeCopy"),
  childExitTrigger: document.querySelector("#childExitTrigger"),
  childProgressText: document.querySelector("#childProgressText"),
  childProgressFill: document.querySelector("#childProgressFill"),
  nextTaskList: document.querySelector("#nextTaskList"),
  loadStatus: document.querySelector("#loadStatus"),
  completionRate: document.querySelector("#completionRate"),
  postponeCount: document.querySelector("#postponeCount"),
  installApp: document.querySelector("#installApp"),
  installHint: document.querySelector("#installHint"),
  installStatus: document.querySelector("#installStatus"),
  exportState: document.querySelector("#exportState"),
  importState: document.querySelector("#importState"),
  importFile: document.querySelector("#importFile"),
  enableCloudSync: document.querySelector("#enableCloudSync"),
  syncNow: document.querySelector("#syncNow"),
  copyFamilyLink: document.querySelector("#copyFamilyLink"),
  syncHint: document.querySelector("#syncHint"),
  syncStatus: document.querySelector("#syncStatus"),
  parentPinStatus: document.querySelector("#parentPinStatus"),
  pinSetupForm: document.querySelector("#pinSetupForm"),
  pinSetupMessage: document.querySelector("#pinSetupMessage"),
  pinModal: document.querySelector("#pinModal"),
  pinModalTitle: document.querySelector("#pinModalTitle"),
  pinModalCopy: document.querySelector("#pinModalCopy"),
  pinModalInput: document.querySelector("#pinModalInput"),
  pinModalError: document.querySelector("#pinModalError"),
  pinCancel: document.querySelector("#pinCancel"),
  pinSubmit: document.querySelector("#pinSubmit"),
  toast: document.querySelector("#toast"),
  taskChipTemplate: document.querySelector("#taskChipTemplate"),
  timelineItemTemplate: document.querySelector("#timelineItemTemplate"),
  navButtons: document.querySelectorAll(".nav-button"),
  screenPanels: document.querySelectorAll(".screen"),
};

initialize();

function initialize() {
  hydrateState();
  applyFamilyLinkFromUrl();
  bindEvents();
  syncProfileForm();
  updateTaskDurationHint("homework");
  setupPwaExperience();
  renderAll();
  applyUiState();
  if (canUseCloudSync()) {
    startSyncLoop();
    pullFromCloud(false);
  }
}

function hydrateState() {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return;
  }

  try {
    const parsed = JSON.parse(stored);
    if (parsed.profile) {
      state.profile = { ...state.profile, ...parsed.profile };
    }
    if (Array.isArray(parsed.tasks)) {
      state.tasks = parsed.tasks;
    }
    if (Array.isArray(parsed.plan)) {
      state.plan = parsed.plan;
    }
    if (typeof parsed.generatedAt === "number") {
      state.generatedAt = parsed.generatedAt;
    }
    if (typeof parsed.currentTaskIndex === "number") {
      state.currentTaskIndex = parsed.currentTaskIndex;
    }
    if (parsed.security) {
      state.security = { ...state.security, ...parsed.security };
    }
    if (parsed.ui) {
      state.ui = { ...state.ui, ...parsed.ui };
    }
    if (parsed.sync) {
      state.sync = { ...state.sync, ...parsed.sync };
    }
  } catch (error) {
    console.warn("无法读取本地状态，已使用默认值。", error);
  }
}

function persistState() {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      profile: state.profile,
      tasks: state.tasks,
      plan: state.plan,
      generatedAt: state.generatedAt,
      currentTaskIndex: state.currentTaskIndex,
      security: state.security,
      ui: state.ui,
      sync: state.sync,
    }),
  );
}

function bindEvents() {
  els.profileForm.addEventListener("input", handleProfileInput);
  els.taskForm.addEventListener("submit", handleTaskSubmit);
  els.taskForm.taskType.addEventListener("change", handleTaskTypeChange);
  els.generatePlan.addEventListener("click", generatePlan);
  els.goInputShortcut.addEventListener("click", () => switchScreen("input"));
  els.goTodayShortcut.addEventListener("click", () => switchScreen("today"));
  els.handoffShortcut.addEventListener("click", enterChildFocusMode);
  els.handoffChildMode.addEventListener("click", enterChildFocusMode);
  els.clearDay.addEventListener("click", clearDay);
  els.startTask.addEventListener("click", startCurrentTask);
  els.completeTask.addEventListener("click", completeCurrentTask);
  els.childExitTrigger.addEventListener("click", openUnlockModal);
  els.installApp.addEventListener("click", handleInstallAction);
  els.exportState.addEventListener("click", exportFamilyData);
  els.importState.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", importFamilyData);
  els.enableCloudSync.addEventListener("click", handleEnableCloudSync);
  els.syncNow.addEventListener("click", () => pullFromCloud(true));
  els.copyFamilyLink.addEventListener("click", handleCopyFamilyLink);
  els.pinSetupForm.addEventListener("submit", handlePinSetup);
  els.pinCancel.addEventListener("click", closePinModal);
  els.pinSubmit.addEventListener("click", submitPinModal);
  els.pinModalInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      submitPinModal();
    }
  });
  els.navButtons.forEach((button) => {
    button.addEventListener("click", () => switchScreen(button.dataset.screenTarget));
  });
  window.addEventListener("online", handleBackOnline);
}

function handleProfileInput(event) {
  const field = event.target.name;
  if (!field) {
    return;
  }

  state.profile[field] = event.target.type === "range" ? Number(event.target.value) : event.target.value;
  state.plan = [];
  state.generatedAt = null;
  state.currentTaskIndex = 0;
  updateRangeLabels();
  persistState();
  renderAll();
  queueCloudSave();
  showToast("任务已经加到今天了。");
}

function handleTaskTypeChange(event) {
  const isClass = event.target.value === "class";
  els.classTimeField.classList.toggle("hidden", !isClass);
  updateTaskDurationHint(event.target.value);
}

function handleTaskSubmit(event) {
  event.preventDefault();
  const formData = new FormData(els.taskForm);
  const taskType = formData.get("taskType");
  const task = {
    id: crypto.randomUUID(),
    title: String(formData.get("taskTitle")).trim(),
    type: taskType,
    duration: Number(formData.get("duration")),
    priority: String(formData.get("priority")),
    classStart: taskType === "class" ? String(formData.get("classStart")) : "",
  };

  if (!task.title) {
    return;
  }

  state.tasks.push(task);
  state.plan = [];
  state.generatedAt = null;
  state.currentTaskIndex = 0;
  els.taskForm.reset();
  els.taskForm.taskType.value = "homework";
  els.classTimeField.classList.add("hidden");
  updateTaskDurationHint("homework");
  persistState();
  renderAll();
  queueCloudSave();
}

function clearDay() {
  state.tasks = [];
  state.plan = [];
  state.generatedAt = null;
  state.currentTaskIndex = 0;
  persistState();
  renderAll();
  queueCloudSave();
  showToast("今天的任务已经清空。");
}

function switchScreen(screen) {
  if (state.ui.childLocked && screen !== "child") {
    return;
  }

  state.ui.activeScreen = screen;
  persistState();
  applyUiState();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function applyUiState() {
  const activeScreen = state.ui.childLocked ? "child" : state.ui.activeScreen;
  state.ui.activeScreen = activeScreen;

  els.appShell.classList.toggle("child-locked", state.ui.childLocked);
  els.childExitTrigger.classList.toggle("hidden", !state.ui.childLocked);
  els.navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.screenTarget === activeScreen);
  });
  els.screenPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.screenPanel === activeScreen);
  });
  document.body.style.overflow = state.ui.childLocked ? "hidden" : "";
}

function syncProfileForm() {
  Object.entries(state.profile).forEach(([key, value]) => {
    if (els.profileForm[key]) {
      els.profileForm[key].value = value;
    }
  });
  updateRangeLabels();
}

function updateRangeLabels() {
  els.focusMinutesValue.textContent = `${state.profile.focusMinutes} 分钟`;
  els.playMinutesValue.textContent = `${state.profile.playMinutes} 分钟`;
}

function enterChildFocusMode() {
  if (!state.plan.length) {
    switchScreen("today");
    updateLoadAlert("warn", "先生成今日计划", "家长先在“今天”页生成计划，再把设备交给孩子会更顺手。");
    showToast("先生成今日计划，再交给孩子会更顺手。");
    return;
  }

  if (!state.security.parentPin) {
    switchScreen("more");
    els.pinSetupMessage.textContent = "先设置 4 位家长密码，再进入孩子专注模式。这样孩子退出时就需要家长确认。";
    showToast("先设置家长密码，再进入孩子专注模式。");
    return;
  }

  closePinModal();
  state.ui.childLocked = true;
  state.ui.activeScreen = "child";
  persistState();
  renderAll();
  showToast("已经切到孩子专注模式。");
}

function openUnlockModal() {
  if (!state.security.parentPin) {
    state.ui.childLocked = false;
    switchScreen("more");
    return;
  }

  els.pinModalTitle.textContent = "请输入家长密码";
  els.pinModalCopy.textContent = "退出孩子专注模式，需要家长来确认。";
  els.pinModalInput.value = "";
  els.pinModalError.classList.add("hidden");
  els.pinModal.classList.remove("hidden");
  window.setTimeout(() => {
    els.pinModalInput.focus();
  }, 40);
}

function closePinModal() {
  els.pinModal.classList.add("hidden");
  els.pinModalInput.value = "";
  els.pinModalError.classList.add("hidden");
}

function submitPinModal() {
  if (els.pinModalInput.value.trim() !== state.security.parentPin) {
    els.pinModalError.classList.remove("hidden");
    return;
  }

  state.ui.childLocked = false;
  state.ui.activeScreen = "today";
  closePinModal();
  persistState();
  renderAll();
}

function handlePinSetup(event) {
  event.preventDefault();
  const formData = new FormData(els.pinSetupForm);
  const nextPin = String(formData.get("parentPin") || "").trim();
  const confirmPin = String(formData.get("parentPinConfirm") || "").trim();

  if (!/^\d{4}$/.test(nextPin)) {
    els.pinSetupMessage.textContent = "家长密码请设置成 4 位数字。";
    return;
  }

  if (nextPin !== confirmPin) {
    els.pinSetupMessage.textContent = "两次输入的密码不一样，请再确认一次。";
    return;
  }

  state.security.parentPin = nextPin;
  persistState();
  renderAll();
  queueCloudSave();
  els.pinSetupForm.reset();
  els.pinSetupMessage.textContent = "家长密码已经保存好了。你和孩子妈妈以后都可以用这组密码解锁。";
  showToast("家长密码已经保存。");
}

function generatePlan() {
  const profile = state.profile;
  const tasks = [...state.tasks];

  if (!tasks.length) {
    updateLoadAlert("warn", "先添加任务", "至少录入一项作业、复习或兴趣班，我们才能生成计划。");
    return;
  }

  const arrival = toMinutes(profile.arrivalTime);
  const bedtime = toMinutes(profile.bedTime);
  const availableWindow = bedtime - arrival;
  const windDownDuration = 25;
  const arrivalBuffer = 20;
  const dinner = buildDinnerBlock(arrival, bedtime);
  const playBlock = {
    id: crypto.randomUUID(),
    kind: "routine",
    type: "routine",
    title: "自由玩耍 / 放松",
    duration: profile.playMinutes,
    priority: "must",
  };
  const warmupBlock = {
    id: crypto.randomUUID(),
    kind: "routine",
    type: "routine",
    title: "到家缓冲",
    duration: arrivalBuffer,
    priority: "must",
  };
  const windDownBlock = {
    id: crypto.randomUUID(),
    kind: "routine",
    type: "routine",
    title: "洗漱与睡前整理",
    duration: windDownDuration,
    priority: "must",
  };

  const classTasks = tasks
    .filter((task) => task.type === "class" && task.classStart)
    .map((task) => ({
      ...task,
      kind: "task",
      start: toMinutes(task.classStart),
      end: toMinutes(task.classStart) + task.duration,
      status: "pending",
    }))
    .sort((left, right) => left.start - right.start);

  const flexibleTasks = tasks
    .filter((task) => task.type !== "class")
    .map((task) => ({ ...task, kind: "task", status: "pending" }));

  const planBlocks = [];
  let cursor = arrival;
  const latestFinish = bedtime - windDownDuration;
  const firstAnchorStart = classTasks.length ? classTasks[0].start : latestFinish;
  const warmupDuration = Math.max(0, Math.min(arrivalBuffer, firstAnchorStart - arrival));

  if (warmupDuration > 0) {
    planBlocks.push(buildScheduledBlock({ ...warmupBlock, duration: warmupDuration }, cursor));
    cursor += warmupDuration;
  }

  const dinnerStart = dinner.start;
  const dinnerEnd = dinner.end;
  const freeWindowBeforeDinner = Math.max(0, dinnerStart - cursor);
  const freeWindowAfterDinner = Math.max(0, latestFinish - dinnerEnd);
  const totalFlexibleNeed = flexibleTasks.reduce((sum, task) => sum + task.duration + breakCost(task.duration), 0) + playBlock.duration;

  if (freeWindowBeforeDinner + freeWindowAfterDinner < totalFlexibleNeed) {
    trimLowPriorityTasks(flexibleTasks, freeWindowBeforeDinner + freeWindowAfterDinner - playBlock.duration);
  }

  const prioritizedFlexible = [...flexibleTasks];
  if (playBlock.duration > 0) {
    prioritizedFlexible.unshift({ ...playBlock, status: "pending" });
  }

  const allAnchors = normalizeAnchors(
    [
    ...classTasks,
    {
      id: dinner.id,
      kind: "routine",
      type: "routine",
      title: dinner.title,
      start: dinner.start,
      end: dinner.end,
      duration: dinner.duration,
      priority: "must",
      status: "pending",
    },
    ],
    cursor,
    latestFinish,
  );

  const scheduledIds = new Set();

  for (const anchor of allAnchors) {
    cursor = fillGap(cursor, anchor.start, prioritizedFlexible, planBlocks, scheduledIds);
    if (cursor < anchor.start) {
      cursor = anchor.start;
    }
    planBlocks.push(anchor);
    cursor = anchor.end;
  }

  fillGap(cursor, latestFinish, prioritizedFlexible, planBlocks, scheduledIds);
  planBlocks.push(buildScheduledBlock(windDownBlock, latestFinish));

  const scheduledTaskIds = new Set(
    planBlocks
      .filter((block) => block.kind === "task" && block.type !== "break" && block.type !== "routine")
      .map((block) => block.id),
  );

  const overflowTasks = tasks.filter((task) => !scheduledTaskIds.has(task.id) && task.type !== "class");
  overflowTasks.forEach((task) => {
    planBlocks.push({
      ...task,
      kind: "overflow",
      status: "postponed",
    });
  });

  state.plan = planBlocks.sort((left, right) => {
    if (typeof left.start === "number" && typeof right.start === "number") {
      return left.start - right.start;
    }
    if (typeof left.start === "number") {
      return -1;
    }
    return 1;
  });
  state.generatedAt = Date.now();
  state.currentTaskIndex = 0;
  state.ui.activeScreen = "today";
  persistState();
  renderAll();
  queueCloudSave();

  updateLoadFeedback(availableWindow);
  showToast("今晚计划已经生成。");
}

function buildDinnerBlock(arrival, bedtime) {
  const defaultStart = 18 * 60 + 15;
  const dinnerStart = clamp(defaultStart, arrival + 45, bedtime - 80);
  return {
    id: crypto.randomUUID(),
    title: "晚饭时间",
    start: dinnerStart,
    end: dinnerStart + 35,
    duration: 35,
  };
}

function trimLowPriorityTasks(tasks, capacity) {
  let remainingCapacity = capacity;
  const kept = [];
  const removable = [];

  tasks.forEach((task) => {
    const need = task.duration + breakCost(task.duration);
    if (remainingCapacity >= need || task.priority === "must") {
      kept.push(task);
      remainingCapacity -= need;
    } else {
      removable.push(task);
    }
  });

  tasks.length = 0;
  [...kept, ...removable].forEach((task) => tasks.push(task));
}

function normalizeAnchors(anchors, earliestStart, latestFinish) {
  return anchors
    .sort((left, right) => left.start - right.start)
    .reduce((normalized, anchor) => {
      const previousEnd = normalized.length ? normalized[normalized.length - 1].end : earliestStart;
      const start = Math.max(anchor.start, previousEnd, earliestStart);
      const end = start + anchor.duration;

      if (start >= latestFinish) {
        return normalized;
      }

      normalized.push({
        ...anchor,
        start,
        end,
      });
      return normalized;
    }, []);
}

function fillGap(cursor, end, tasks, planBlocks, scheduledIds) {
  let pointer = cursor;

  while (pointer < end) {
    const nextTask = tasks.find((task) => !scheduledIds.has(task.id));
    if (!nextTask) {
      break;
    }

    const needed = nextTask.duration;
    if (pointer + needed > end) {
      break;
    }

    planBlocks.push(buildScheduledBlock(nextTask, pointer));
    scheduledIds.add(nextTask.id);
    pointer += needed;

    const restMinutes = breakCost(nextTask.duration);
    if (restMinutes && pointer + restMinutes <= end) {
      planBlocks.push({
        id: crypto.randomUUID(),
        kind: "task",
        type: "break",
        title: "短暂休息",
        duration: restMinutes,
        start: pointer,
        end: pointer + restMinutes,
        priority: "must",
        status: "pending",
      });
      pointer += restMinutes;
    }
  }

  return pointer;
}

function buildScheduledBlock(task, start) {
  return {
    ...task,
    start,
    end: start + task.duration,
    status: task.status ?? "pending",
  };
}

function breakCost(duration) {
  if (duration >= 25) {
    return 10;
  }
  if (duration >= 15) {
    return 5;
  }
  return 0;
}

function startCurrentTask() {
  const task = getCurrentActionableTask();
  if (!task || task.status === "in_progress") {
    return;
  }

  task.status = "in_progress";
  task.startedAt = Date.now();
  persistState();
  renderAll();
  queueCloudSave();
  showToast(`开始：${task.title}`);
}

function completeCurrentTask() {
  const task = getCurrentActionableTask();
  if (!task) {
    return;
  }

  task.status = "done";
  delete task.startedAt;

  const nextIndex = state.plan.findIndex(
    (item, index) =>
      index > state.currentTaskIndex &&
      item.kind === "task" &&
      item.type !== "break" &&
      item.type !== "routine" &&
      item.status !== "done",
  );

  state.currentTaskIndex = nextIndex === -1 ? state.currentTaskIndex : nextIndex;
  persistState();
  renderAll();
  queueCloudSave();
  showToast(`完成：${task.title}`);
}

function getCurrentActionableTask() {
  const actionable = state.plan.filter(
    (item) => item.kind === "task" && item.type !== "break" && item.type !== "routine",
  );

  const current = actionable.find((item) => item.status !== "done");
  if (!current) {
    return null;
  }

  state.currentTaskIndex = state.plan.findIndex((item) => item.id === current.id);
  return current;
}

function renderAll() {
  renderTaskList();
  renderTimeline();
  renderOverview();
  renderChildView();
  renderReview();
  renderLockUi();
  renderLoadAlertState();
  updateInstallUi();
  renderSyncUi();
  applyUiState();
}

function renderTaskList() {
  stopTaskDrag(false);
  els.taskList.innerHTML = "";

  if (!state.tasks.length) {
    const empty = document.createElement("p");
    empty.className = "muted-copy";
    empty.textContent = "今天还没有任务，可以先录入作业、复习或兴趣班。";
    els.taskList.appendChild(empty);
    return;
  }

  state.tasks.forEach((task) => {
    const fragment = els.taskChipTemplate.content.cloneNode(true);
    const chip = fragment.querySelector(".task-chip");
    const removeButton = fragment.querySelector(".icon-button");
    chip.dataset.type = task.type;
    chip.dataset.taskId = task.id;
    chip.querySelector(".task-chip-type").textContent = taskTypeMeta[task.type].label;
    chip.querySelector(".task-chip-title").textContent = task.title;
    chip.querySelector(".task-chip-meta").textContent = describeTask(task);
    removeButton.addEventListener("click", () => {
      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      state.plan = [];
      state.generatedAt = null;
      state.currentTaskIndex = 0;
      persistState();
      renderAll();
      queueCloudSave();
      showToast(`已删除：${task.title}`);
    });
    chip.addEventListener("pointerdown", (event) => handleTaskPointerDown(event, chip, task.id));
    els.taskList.appendChild(fragment);
  });
}

function handleTaskPointerDown(event, chip, taskId) {
  if (event.button !== 0 && event.pointerType !== "touch") {
    return;
  }

  if (event.target.closest(".icon-button")) {
    return;
  }

  stopTaskDrag(false);

  taskDragState = {
    taskId,
    chip,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: 0,
    offsetY: 0,
    active: false,
    placeholder: null,
    timer: window.setTimeout(() => activateTaskDrag(), 220),
  };

  window.addEventListener("pointermove", handleTaskPointerMove, { passive: false });
  window.addEventListener("pointerup", handleTaskPointerUp);
  window.addEventListener("pointercancel", handleTaskPointerUp);
}

function activateTaskDrag() {
  if (!taskDragState || taskDragState.active) {
    return;
  }

  const rect = taskDragState.chip.getBoundingClientRect();
  taskDragState.active = true;
  taskDragState.offsetX = taskDragState.startX - rect.left;
  taskDragState.offsetY = taskDragState.startY - rect.top;
  taskDragState.placeholder = document.createElement("div");
  taskDragState.placeholder.className = "task-drop-slot";
  taskDragState.placeholder.style.height = `${rect.height}px`;
  taskDragState.chip.after(taskDragState.placeholder);
  taskDragState.chip.classList.add("dragging");
  taskDragState.chip.style.width = `${rect.width}px`;
  taskDragState.chip.style.left = `${rect.left}px`;
  taskDragState.chip.style.top = `${rect.top}px`;
  document.body.classList.add("dragging-task");
}

function handleTaskPointerMove(event) {
  if (!taskDragState || event.pointerId !== taskDragState.pointerId) {
    return;
  }

  if (!taskDragState.active) {
    const movedTooFar =
      Math.abs(event.clientY - taskDragState.startY) > 8 ||
      Math.abs(event.clientX - taskDragState.startX) > 8;
    if (movedTooFar) {
      stopTaskDrag(false);
    }
    return;
  }

  event.preventDefault();
  taskDragState.chip.style.left = `${event.clientX - taskDragState.offsetX}px`;
  taskDragState.chip.style.top = `${event.clientY - taskDragState.offsetY}px`;
  moveTaskPlaceholder(event.clientY);
}

function moveTaskPlaceholder(pointerY) {
  if (!taskDragState?.placeholder) {
    return;
  }

  const siblings = [...els.taskList.querySelectorAll(".task-chip:not(.dragging)")];
  let inserted = false;

  for (const sibling of siblings) {
    const rect = sibling.getBoundingClientRect();
    if (pointerY < rect.top + rect.height / 2) {
      els.taskList.insertBefore(taskDragState.placeholder, sibling);
      inserted = true;
      break;
    }
  }

  if (!inserted) {
    els.taskList.appendChild(taskDragState.placeholder);
  }
}

function handleTaskPointerUp(event) {
  if (!taskDragState || event.pointerId !== taskDragState.pointerId) {
    return;
  }

  if (!taskDragState.active) {
    stopTaskDrag(false);
    return;
  }

  const targetIndex = [...els.taskList.children]
    .filter((child) => child !== taskDragState.chip)
    .indexOf(taskDragState.placeholder);

  reorderTask(taskDragState.taskId, targetIndex);
  stopTaskDrag(false);
  persistState();
  renderAll();
  queueCloudSave();
  showToast("任务顺序已经调整。");
}

function stopTaskDrag(keepListeners = false) {
  if (!taskDragState) {
    return;
  }

  window.clearTimeout(taskDragState.timer);

  if (taskDragState.chip) {
    taskDragState.chip.classList.remove("dragging");
    taskDragState.chip.style.width = "";
    taskDragState.chip.style.left = "";
    taskDragState.chip.style.top = "";
  }

  if (taskDragState.placeholder) {
    taskDragState.placeholder.remove();
  }

  document.body.classList.remove("dragging-task");

  if (!keepListeners) {
    window.removeEventListener("pointermove", handleTaskPointerMove);
    window.removeEventListener("pointerup", handleTaskPointerUp);
    window.removeEventListener("pointercancel", handleTaskPointerUp);
  }

  taskDragState = null;
}

function reorderTask(taskId, targetIndex) {
  const sourceIndex = state.tasks.findIndex((task) => task.id === taskId);
  if (sourceIndex === -1 || targetIndex === -1) {
    return;
  }

  const [task] = state.tasks.splice(sourceIndex, 1);
  state.tasks.splice(Math.min(targetIndex, state.tasks.length), 0, task);
  state.plan = [];
  state.generatedAt = null;
  state.currentTaskIndex = 0;
}

function renderTimeline() {
  els.timeline.innerHTML = "";

  if (!state.plan.length) {
    return;
  }

  state.plan.forEach((block) => {
    const fragment = els.timelineItemTemplate.content.cloneNode(true);
    const item = fragment.querySelector(".timeline-item");
    const time = fragment.querySelector(".timeline-time");
    const badge = fragment.querySelector(".timeline-badge");
    const title = fragment.querySelector(".timeline-title");
    const copy = fragment.querySelector(".timeline-copy");

    item.dataset.type = block.type || "routine";
    badge.dataset.type = block.type || "routine";

    if (block.kind === "overflow") {
      item.classList.add("overflow-item");
      time.textContent = "延后处理";
      badge.textContent = "建议延后";
      title.textContent = block.title;
      copy.textContent = `${describeTask(block)}。今天已经偏满，建议留到明天更轻松的时段。`;
    } else {
      time.textContent = `${formatMinutes(block.start)} - ${formatMinutes(block.end)}`;
      badge.textContent = taskTypeMeta[block.type]?.label ?? "安排";
      title.textContent = block.title;
      copy.textContent = describeScheduledBlock(block);
      if (block.status === "done") {
        item.style.opacity = "0.7";
      }
      if (block.status === "in_progress") {
        item.classList.add("active-item");
      }
    }

    els.timeline.appendChild(fragment);
  });
}

function renderOverview() {
  const actionable = state.plan.filter(
    (item) => item.kind === "task" && item.type !== "break" && item.type !== "routine",
  );
  const completed = actionable.filter((item) => item.status === "done").length;
  const mustTasks = state.tasks.filter((task) => task.priority === "must").length;
  const delayTasks = state.plan.filter((item) => item.kind === "overflow").length;
  const focusedMinutes = actionable
    .filter((item) => item.kind === "task")
    .reduce((sum, item) => sum + item.duration, 0);
  const completionRate = actionable.length ? Math.round((completed / actionable.length) * 100) : 0;

  els.mustCount.textContent = `${mustTasks} 项`;
  els.delayCount.textContent = `${delayTasks} 项`;
  els.focusUsed.textContent = `${focusedMinutes} 分钟`;
  els.loadStatus.textContent = computeLoadText();
  els.completionRate.textContent = `${completionRate}%`;
  els.postponeCount.textContent = `${delayTasks} 项`;
}

function renderLockUi() {
  const hasPin = Boolean(state.security.parentPin);
  const hasPlan = Boolean(state.plan.length);
  els.handoffChildMode.disabled = false;

  if (!hasPin) {
    els.parentPinStatus.textContent = "还没有设置家长密码。建议先设好，再把手机交给孩子。";
    els.childModeCopy.textContent = "先去“更多”里设置 4 位家长密码。设置后，孩子端就只会看到她该做的事。";
    els.handoffShortcut.textContent = "先设置家长锁";
    els.handoffChildMode.textContent = "先设置家长锁";
    return;
  }

  els.parentPinStatus.textContent = "家长密码已设置。修改时，直接输入新的 4 位密码覆盖保存即可。";
  els.childModeCopy.textContent = state.ui.childLocked
    ? "孩子专注模式已经开启。现在设备上只显示当前任务、下一步和完成进度。"
    : "已设置家长密码。进入孩子专注模式后，只保留当前任务、下一步和完成进度。";
  els.handoffShortcut.textContent = hasPlan ? "交给孩子" : "先生成计划";
  els.handoffChildMode.textContent = state.ui.childLocked
    ? "孩子正在使用中"
    : hasPlan
      ? "进入孩子专注模式"
      : "先生成今日计划";
  els.handoffChildMode.disabled = state.ui.childLocked;
}

function renderChildView() {
  const name = state.profile.childName || "小朋友";
  const actionable = state.plan.filter(
    (item) => item.kind === "task" && item.type !== "break" && item.type !== "routine",
  );
  const current = actionable.find((item) => item.status !== "done");
  const doneCount = actionable.filter((item) => item.status === "done").length;
  const progress = actionable.length ? (doneCount / actionable.length) * 100 : 0;

  els.childGreeting.textContent = `${name}，今晚我们一步一步来`;
  els.childProgressText.textContent = `${doneCount} / ${actionable.length}`;
  els.childProgressFill.style.width = `${progress}%`;

  if (!current) {
    stopChildCountdown();
    els.childCurrent.dataset.type = "routine";
    els.childCurrent.innerHTML = `
      <p class="child-current-label">当前任务</p>
      <h4>${state.plan.length ? "今天完成啦" : "还没有生成计划"}</h4>
      <p>${state.plan.length ? "可以自由玩耍或者准备睡前整理了。" : "回到家长端生成计划后，这里会出现下一步。"} </p>
    `;
  } else {
    els.childCurrent.dataset.type = current.type;
    const statusText = current.status === "in_progress" ? "进行中" : "待开始";
    const statusClass = current.status === "in_progress" ? "active" : "pending";
    const timeRange = hasScheduledTime(current)
      ? `${formatMinutes(current.start)} - ${formatMinutes(current.end)}`
      : `${current.duration} 分钟`;
    const countdownMarkup = current.status === "in_progress"
      ? `<div class="child-countdown" id="childCountdown">--:--</div>`
      : "";
    els.childCurrent.innerHTML = `
      <p class="child-current-label">当前任务</p>
      <div class="child-current-topline">
        <div class="child-status-pill ${statusClass}">${statusText}</div>
        <div class="child-time-chip">${timeRange}</div>
        ${countdownMarkup}
      </div>
      <h4>${current.title}</h4>
      <p>${current.duration} 分钟，${taskTypeMeta[current.type].detail}。完成这一项，就离今天的目标更近一步。</p>
    `;
    syncChildCountdown(current);
  }

  els.startTask.disabled = !current || current.status === "in_progress";
  els.completeTask.disabled = !current;
  els.startTask.textContent = current ? (current.status === "in_progress" ? "正在进行" : "开始当前任务") : "等待计划";
  els.completeTask.textContent = current ? "完成这一项" : "等待计划";

  els.nextTaskList.innerHTML = "";
  const nextTasks = actionable.filter((item) => item.status !== "done").slice(1, 4);
  if (!nextTasks.length) {
    const empty = document.createElement("p");
    empty.className = "muted-copy";
    empty.textContent = "接下来会轻松很多，先把手头这一项做好。";
    els.nextTaskList.appendChild(empty);
  } else {
    nextTasks.forEach((task, index) => {
      const card = document.createElement("article");
      card.className = "next-task-card";
      card.dataset.type = task.type;
      card.innerHTML = `
        <small>第 ${index + 2} 步</small>
        <strong>${task.title}</strong>
        <p>${formatTaskTime(task)} · ${taskTypeMeta[task.type].label}</p>
      `;
      els.nextTaskList.appendChild(card);
    });
  }
}

function syncChildCountdown(task) {
  stopChildCountdown();
  const countdownEl = document.querySelector("#childCountdown");
  if (!countdownEl || task.status !== "in_progress") {
    return;
  }

  const tick = () => {
    const remainingSeconds = getTaskCountdownSeconds(task);
    countdownEl.textContent = formatCountdown(remainingSeconds);
    countdownEl.classList.toggle("ending", remainingSeconds <= 300);
  };

  tick();
  childCountdownTimer = window.setInterval(tick, 1000);
}

function stopChildCountdown() {
  if (!childCountdownTimer) {
    return;
  }

  window.clearInterval(childCountdownTimer);
  childCountdownTimer = null;
}

function renderReview() {
  const actionable = state.plan.filter(
    (item) => item.kind === "task" && item.type !== "break" && item.type !== "routine",
  );
  const completed = actionable.filter((item) => item.status === "done");
  const total = actionable.length;
  const overloadLevel = computeLoadLevel();
  const smoothTask = completed
    .slice()
    .sort((left, right) => left.duration - right.duration)[0];

  els.reviewCompletion.textContent = `${completed.length} / ${total}`;

  if (!total) {
    els.reviewCompletionCopy.textContent = "今晚还没有形成计划。";
    els.reviewSmooth.textContent = "待开始";
    els.reviewSmoothCopy.textContent = "完成任务后，这里会判断哪个环节最顺手。";
    els.reviewAdvice.textContent = "先安排今天";
    els.reviewAdviceCopy.textContent = "今天的节奏先立起来，明天才会更轻松。";
    return;
  }

  if (!completed.length) {
    els.reviewCompletionCopy.textContent = "计划已经准备好，先完成第一项，节奏就会慢慢起来。";
  } else if (completed.length === total) {
    els.reviewCompletionCopy.textContent = "今晚的安排已经完成，节奏控制得很不错。";
  } else {
    els.reviewCompletionCopy.textContent = "完成过半比全部堆着更重要，继续保持这样的推进方式。";
  }

  if (smoothTask) {
    els.reviewSmooth.textContent = smoothTask.title;
    els.reviewSmoothCopy.textContent = "时长适中、阻力较小，这类任务适合放在开始阶段建立状态。";
  } else {
    els.reviewSmooth.textContent = "还未判断";
    els.reviewSmoothCopy.textContent = "先完成 1 项后，系统再给更准确的判断。";
  }

  if (overloadLevel === "bad") {
    els.reviewAdvice.textContent = "明天减 1 项";
    els.reviewAdviceCopy.textContent = "兴趣班日不要再叠加太多习惯任务，优先保留作业和阅读。";
  } else if (overloadLevel === "warn") {
    els.reviewAdvice.textContent = "保留缓冲";
    els.reviewAdviceCopy.textContent = "明天建议把第一项任务控制在 20 分钟内，更容易启动。";
  } else {
    els.reviewAdvice.textContent = "节奏合适";
    els.reviewAdviceCopy.textContent = "可以继续沿用这个结构：作业在前，兴趣班后做轻任务。";
  }
}

function describeTask(task) {
  const pieces = [`${task.duration} 分钟`];
  const priorityMap = {
    must: "必须完成",
    should: "尽量完成",
    optional: "可延后",
  };

  pieces.push(priorityMap[task.priority]);
  if (task.type === "class" && task.classStart) {
    pieces.push(`${task.classStart} 开始`);
  }
  return pieces.join(" · ");
}

function describeScheduledBlock(block) {
  if (block.type === "break") {
    return "专注后留一点空隙，让孩子重新找回状态。";
  }

  if (block.type === "routine") {
    if (block.title.includes("自由玩耍")) {
      return "先释放一点精力，后面的学习阻力会更小。";
    }
    if (block.title.includes("晚饭")) {
      return "给家庭留出完整吃饭时间，不把所有事情都挤在一起。";
    }
    return "生活节奏也是计划的一部分，不必把每分钟都塞满。";
  }

  const hints = {
    must: "这是今晚最重要的一项，完成后家长会更安心。",
    should: "如果状态不错，今天完成会更理想。",
    optional: "如果已经偏晚，可以考虑留到明天。",
  };
  return `${describeTask(block)}。${hints[block.priority]}`;
}

function computeLoadLevel() {
  if (!state.plan.length) {
    return "idle";
  }

  const focusCap = state.profile.focusMinutes;
  const scheduledFocus = state.plan
    .filter((item) => item.kind === "task" && item.type !== "break" && item.type !== "routine")
    .reduce((sum, item) => sum + item.duration, 0);
  const postponed = state.plan.filter((item) => item.kind === "overflow").length;
  const ratio = scheduledFocus / focusCap;

  if (postponed > 0 || ratio > 1) {
    return "bad";
  }
  if (ratio > 0.85) {
    return "warn";
  }
  return "good";
}

function computeLoadText() {
  const loadMap = {
    idle: "待生成",
    good: "节奏合适",
    warn: "稍微偏满",
    bad: "已经超负荷",
  };
  return loadMap[computeLoadLevel()];
}

function updateLoadFeedback(availableWindow) {
  const loadLevel = computeLoadLevel();
  const focusCap = state.profile.focusMinutes;
  const scheduledFocus = state.plan
    .filter((item) => item.kind === "task" && item.type !== "break" && item.type !== "routine")
    .reduce((sum, item) => sum + item.duration, 0);
  const postponed = state.plan.filter((item) => item.kind === "overflow").length;

  if (loadLevel === "good") {
    updateLoadAlert(
      "good",
      "今天安排得刚刚好",
      `今晚可用时段约 ${availableWindow} 分钟，实际专注安排 ${scheduledFocus} 分钟，还保留了玩耍和缓冲。`,
    );
    return;
  }

  if (loadLevel === "warn") {
    updateLoadAlert(
      "warn",
      "今天稍微偏满",
      `已经安排 ${scheduledFocus} / ${focusCap} 分钟的专注任务。建议家长不要临时再加内容。`,
    );
    return;
  }

  updateLoadAlert(
    "bad",
    "今天已经超负荷",
    `系统建议延后 ${postponed} 项，让孩子先把最重要的部分完成。计划不是越满越好，节奏更重要。`,
  );
}

function updateLoadAlert(level, title, copy) {
  els.loadAlert.className = "alert-card";
  if (level !== "idle") {
    els.loadAlert.classList.add(level);
  }
  els.loadAlert.innerHTML = `
    <p class="alert-title">${title}</p>
    <p class="alert-copy">${copy}</p>
  `;
}

function renderLoadAlertState() {
  if (state.plan.length) {
    updateLoadFeedback(toMinutes(state.profile.bedTime) - toMinutes(state.profile.arrivalTime));
    return;
  }

  if (state.tasks.length) {
    updateLoadAlert("warn", "任务已经录入", "现在可以点击“生成今日计划”，把今晚排成孩子容易执行的节奏。");
    return;
  }

  updateLoadAlert("idle", "等待计划生成", "先录入任务，再点击“生成今日计划”。");
}

function updateTaskDurationHint(taskType) {
  if (taskType === "class") {
    els.taskDurationHint.textContent = "兴趣班建议填写总占用时长，也就是上课 + 等待 + 路上时间；如果只填上课本身，系统会低估今晚负荷。";
    return;
  }

  els.taskDurationHint.textContent = "作业、复习和习惯任务填写任务本身时长即可，不需要额外加上路上时间。";
}

function setupPwaExperience() {
  cleanLegacyCaches();
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(`./sw.js?v=${APP_REVISION}`).catch((error) => {
        console.warn("Service Worker 注册失败。", error);
      });
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallUi();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
      updateInstallUi("已经安装到这台设备了，接下来可以从桌面直接打开。");
      showToast("已经安装到这台设备了。");
  });
}

async function handleInstallAction() {
  if (isStandalone()) {
    updateInstallUi("这台设备已经安装好了，可以直接从主屏幕打开。");
    showToast("这台设备已经安装好了。");
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === "accepted") {
      updateInstallUi("安装请求已经发出，完成后你就能像普通 App 一样使用它。");
      showToast("安装请求已经发出。");
    } else {
      updateInstallUi("你这次先取消了安装，之后随时还能再点一次。");
      showToast("这次先取消了安装。");
    }
    deferredInstallPrompt = null;
    return;
  }

  if (isIOS()) {
    updateInstallUi("请用 Safari 打开这个地址，然后点“分享” -> “添加到主屏幕”。");
    showToast("请用 Safari 的“添加到主屏幕”来安装。");
    return;
  }

  updateInstallUi("请在浏览器右上角菜单里找“安装应用”或“添加到主屏幕”。华为设备建议用浏览器或 Chrome 打开。");
  showToast("请在浏览器菜单里找“安装应用”或“添加到主屏幕”。");
}

function updateInstallUi(statusOverride = "") {
  const manualSyncCopy = "现在已经支持家庭云同步；“导出 / 导入家庭数据”保留为备用方式。";

  if (isStandalone()) {
    els.installApp.disabled = true;
    els.installApp.textContent = "这台设备已安装";
    els.installHint.textContent = "已经是安装版了，以后直接点桌面图标就能打开，不用再开电脑。";
    els.installStatus.textContent = statusOverride || manualSyncCopy;
    return;
  }

  els.installApp.disabled = false;

  if (deferredInstallPrompt) {
    els.installApp.textContent = "安装到这台设备";
    els.installHint.textContent = "这台设备支持一键安装。点一下按钮，就能把它放到主屏幕上。";
    els.installStatus.textContent = statusOverride || manualSyncCopy;
    return;
  }

  if (isIOS()) {
    els.installApp.textContent = "查看 iPhone 安装方法";
    els.installHint.textContent = "iPhone 上请用 Safari 打开，再点“分享” -> “添加到主屏幕”。";
    els.installStatus.textContent = statusOverride || manualSyncCopy;
    return;
  }

  els.installApp.textContent = "查看安装方法";
  els.installHint.textContent = "华为手机和平板一般可以在浏览器菜单里找到“安装应用”或“添加到主屏幕”。";
  els.installStatus.textContent = statusOverride || manualSyncCopy;
}

function exportFamilyData() {
  const exportSync = state.sync.familySlug
    ? {
        familySlug: state.sync.familySlug,
        familySecret: state.sync.familySecret,
        lastSyncedAt: state.sync.lastSyncedAt,
      }
    : undefined;

  const exported = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    app: "qing-plan",
    state: {
      profile: state.profile,
      tasks: state.tasks,
      plan: state.plan,
      generatedAt: state.generatedAt,
      currentTaskIndex: state.currentTaskIndex,
      security: state.security,
      sync: exportSync,
    },
  };

  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `qing-plan-family-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
  updateInstallUi("家庭数据已经导出。你可以通过 AirDrop、微信文件或华为分享发到另一台设备，再导入。");
  showToast("家庭数据已经导出。");
}

function importFamilyData(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const imported = parsed.state || parsed;

      state.profile = { ...state.profile, ...(imported.profile || {}) };
      state.tasks = Array.isArray(imported.tasks) ? imported.tasks : [];
      state.plan = Array.isArray(imported.plan) ? imported.plan : [];
      state.generatedAt = typeof imported.generatedAt === "number" ? imported.generatedAt : null;
      state.currentTaskIndex = typeof imported.currentTaskIndex === "number" ? imported.currentTaskIndex : 0;
      state.security = { ...state.security, ...(imported.security || {}) };
      state.sync = {
        ...state.sync,
        familySlug: imported.sync?.familySlug || state.sync.familySlug,
        familySecret: imported.sync?.familySecret || state.sync.familySecret,
        lastSyncedAt: imported.sync?.lastSyncedAt || "",
        pending: false,
        status: "idle",
        message: imported.sync?.familySlug ? "已导入家庭同步连接。" : state.sync.message,
      };

      syncProfileForm();
      persistState();
      renderAll();
      updateInstallUi("家庭数据已经导入成功。这台设备现在可以继续接着用了。");
      showToast("家庭数据已经导入成功。");
      if (canUseCloudSync()) {
        startSyncLoop();
        pullFromCloud(true);
      }
    } catch (error) {
      console.warn("导入失败。", error);
      updateInstallUi("导入失败了，请确认选择的是轻计划导出的 JSON 文件。");
      showToast("导入失败了，请换一个正确的文件再试。");
    } finally {
      els.importFile.value = "";
    }
  };
  reader.readAsText(file);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIOS() {
  return /iPad|iPhone|iPod/i.test(window.navigator.userAgent);
}

function applyFamilyLinkFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const familyToken = params.get(FAMILY_PARAM_KEY);
  if (!familyToken) {
    return;
  }

  const familyPayload = decodeFamilyToken(familyToken);
  if (!familyPayload?.familySlug || !familyPayload?.familySecret) {
    return;
  }

  state.sync = {
    ...state.sync,
    familySlug: familyPayload.familySlug,
    familySecret: familyPayload.familySecret,
    pending: false,
    status: "idle",
    message: "已通过家庭加入链接接入共享数据。",
  };
  persistState();

  const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
  window.history.replaceState({}, "", cleanUrl);
}

function renderSyncUi() {
  if (!isCloudSyncConfigured()) {
    els.enableCloudSync.disabled = true;
    els.syncNow.disabled = true;
    els.copyFamilyLink.disabled = true;
    els.enableCloudSync.textContent = "等待接入云端";
    els.syncNow.textContent = "云端未接入";
    els.copyFamilyLink.textContent = "等待家庭链接";
    els.syncHint.textContent = "等我把线上版本和云端数据库接好后，这里就能真正启用全家同步。";
    els.syncStatus.textContent = "当前还是本机版，还没有接上云端数据库。";
    return;
  }

  const familyReady = canUseCloudSync();
  els.enableCloudSync.disabled = false;
  els.syncNow.disabled = !familyReady;
  els.copyFamilyLink.disabled = !familyReady;

  if (!familyReady) {
    els.enableCloudSync.textContent = "开启家庭同步";
    els.syncNow.textContent = "等待绑定";
    els.copyFamilyLink.textContent = "等待家庭链接";
    els.syncHint.textContent = "第一次开启后，会为你们家生成一份共享空间。之后点“复制家庭加入链接”，把链接发到另外两台设备打开一次即可。";
    els.syncStatus.textContent = state.sync.message || "云端已经准备好，这台设备还没有绑定家庭同步空间。";
    return;
  }

  els.enableCloudSync.textContent = "已绑定家庭同步";
  els.syncNow.textContent = state.sync.status === "syncing" ? "同步中..." : "立即同步";
  els.copyFamilyLink.textContent = "复制家庭加入链接";
  els.syncHint.textContent = `家庭空间已连上：${state.sync.familySlug}。把家庭加入链接分别在 iPhone、华为手机和平板上打开一次，它们就会自动连到同一份数据。`;

  if (state.sync.status === "error") {
    els.syncStatus.textContent = state.sync.message || "同步时出了点问题，稍后可以再试一次。";
    return;
  }

  if (state.sync.pending) {
    els.syncStatus.textContent = "本机有新改动，正在准备同步到云端。";
    return;
  }

  if (state.sync.lastSyncedAt) {
    els.syncStatus.textContent = `最近一次同步：${formatSyncTime(state.sync.lastSyncedAt)}。${state.sync.message || "数据已经和云端对齐。"}`;
    return;
  }

  els.syncStatus.textContent = state.sync.message || "已连上家庭同步空间，接下来会自动同步。";
}

function queueCloudSave() {
  if (syncHydrating || !canUseCloudSync()) {
    return;
  }

  state.sync.pending = true;
  state.sync.status = "idle";
  state.sync.message = "本机改动待同步";
  persistState();

  window.clearTimeout(syncSaveTimer);
  syncSaveTimer = window.setTimeout(() => {
    saveToCloud();
  }, 1200);
}

async function handleEnableCloudSync() {
  if (!isCloudSyncConfigured()) {
    renderSyncUi();
    return;
  }

  if (!canUseCloudSync()) {
    state.sync.status = "syncing";
    state.sync.message = "正在创建你们家的家庭同步空间...";
    renderAll();

    try {
      const payload = await callSupabaseRpc("create_family_space", {
        initial_state: buildSerializableState(),
      });

      state.sync.familySlug = payload.family_slug;
      state.sync.familySecret = payload.family_secret;
      state.sync.lastSyncedAt = payload.updated_at || "";
      state.sync.pending = false;
      state.sync.status = "ready";
      state.sync.message = "家庭同步空间已经创建好了。现在可以复制家庭加入链接，发到另外两台设备。";
      persistState();
      renderAll();
      startSyncLoop();
      showToast("家庭同步空间已经创建好了。");
      return;
    } catch (error) {
      console.warn("创建家庭同步空间失败。", error);
      state.sync.status = "error";
      state.sync.message = "创建家庭同步空间失败了，请稍后再点一次。";
      persistState();
      renderAll();
      showToast("创建家庭同步空间失败了。");
      return;
    }
  }

  await pullFromCloud(true);
}

function handleBackOnline() {
  if (!canUseCloudSync()) {
    return;
  }
  pullFromCloud(true);
}

function startSyncLoop() {
  window.clearInterval(syncPollTimer);
  if (!canUseCloudSync()) {
    return;
  }

  syncPollTimer = window.setInterval(() => {
    pullFromCloud(false);
  }, 30000);
}

async function pullFromCloud(forceMessage) {
  if (!canUseCloudSync() || state.sync.status === "syncing") {
    return;
  }

  state.sync.status = "syncing";
  if (forceMessage) {
    state.sync.message = "正在从云端拉取最新数据...";
    renderAll();
  } else {
    persistState();
  }

  try {
    const payload = await callSupabaseRpc("get_family_space", {
      p_family_slug: state.sync.familySlug,
      p_family_secret: state.sync.familySecret,
    });

    const remoteUpdatedAt = payload.updated_at || "";
    if (!state.sync.lastSyncedAt || remoteUpdatedAt > state.sync.lastSyncedAt) {
      syncHydrating = true;
      applySerializableState(payload.state || {});
      syncHydrating = false;
      state.sync.message = "已经拉取到最新家庭数据。";
    } else {
      state.sync.message = forceMessage ? "这台设备已经是最新数据了。" : "已连接云端";
    }

    state.sync.lastSyncedAt = remoteUpdatedAt;
    state.sync.status = "ready";
    state.sync.pending = false;
    persistState();
    renderAll();
  } catch (error) {
    console.warn("拉取云端数据失败。", error);
    state.sync.status = "error";
    state.sync.message = "拉取云端数据失败了，稍后会再试。";
    persistState();
    renderAll();
  }
}

async function saveToCloud() {
  if (!canUseCloudSync()) {
    return;
  }

  state.sync.status = "syncing";
  state.sync.message = "正在把本机改动同步到云端...";
  persistState();
  renderAll();

  try {
    const payload = await callSupabaseRpc("save_family_space", {
      p_family_slug: state.sync.familySlug,
      p_family_secret: state.sync.familySecret,
      p_state: buildSerializableState(),
    });

    state.sync.lastSyncedAt = payload.updated_at || new Date().toISOString();
    state.sync.pending = false;
    state.sync.status = "ready";
    state.sync.message = "本机改动已经同步到云端。";
    persistState();
    renderAll();
  } catch (error) {
    console.warn("保存到云端失败。", error);
    state.sync.status = "error";
    state.sync.message = "同步到云端失败了，稍后会自动重试。";
    persistState();
    renderAll();
  }
}

async function handleCopyFamilyLink() {
  if (!canUseCloudSync()) {
    state.sync.message = "请先开启家庭同步，再复制家庭加入链接。";
    renderAll();
    return;
  }

  const joinLink = buildFamilyJoinLink();
  if (!joinLink) {
    state.sync.message = "家庭加入链接还没准备好，请稍后再试一次。";
    renderAll();
    return;
  }

  const copied = await copyTextToClipboard(joinLink);
  state.sync.message = copied
    ? "家庭加入链接已经复制好了。发到另外两台设备打开一次即可。"
    : "已生成家庭加入链接。如果系统没自动复制，请手动复制浏览器地址。";
  persistState();
  renderAll();
  showToast(copied ? "家庭加入链接已经复制。" : "系统没自动复制，请手动复制浏览器地址。");
}

async function cleanLegacyCaches() {
  if (!("caches" in window)) {
    return;
  }

  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith("qing-plan-") && key !== `qing-plan-${APP_REVISION}`)
        .map((key) => caches.delete(key)),
    );
  } catch (error) {
    console.warn("清理旧缓存失败。", error);
  }
}

function showToast(message) {
  if (!els.toast || !message) {
    return;
  }

  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  els.toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("visible");
    els.toast.classList.add("hidden");
  }, 2200);
}

function buildSerializableState() {
  return {
    profile: state.profile,
    tasks: state.tasks,
    plan: state.plan,
    generatedAt: state.generatedAt,
    currentTaskIndex: state.currentTaskIndex,
    security: state.security,
  };
}

function applySerializableState(payload) {
  state.profile = { ...state.profile, ...(payload.profile || {}) };
  state.tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  state.plan = Array.isArray(payload.plan) ? payload.plan : [];
  state.generatedAt = typeof payload.generatedAt === "number" ? payload.generatedAt : null;
  state.currentTaskIndex = typeof payload.currentTaskIndex === "number" ? payload.currentTaskIndex : 0;
  state.security = { ...state.security, ...(payload.security || {}) };
  syncProfileForm();
}

function isCloudSyncConfigured() {
  return Boolean(APP_CONFIG.sync?.enabled && APP_CONFIG.sync?.supabaseUrl && APP_CONFIG.sync?.supabaseAnonKey);
}

function canUseCloudSync() {
  return Boolean(isCloudSyncConfigured() && state.sync.familySlug && state.sync.familySecret);
}

function buildFamilyJoinLink() {
  if (!canUseCloudSync()) {
    return "";
  }

  const payload = encodeFamilyToken({
    familySlug: state.sync.familySlug,
    familySecret: state.sync.familySecret,
  });
  return `${window.location.origin}${window.location.pathname}?${FAMILY_PARAM_KEY}=${encodeURIComponent(payload)}`;
}

async function callSupabaseRpc(functionName, payload) {
  const response = await fetch(`${APP_CONFIG.sync.supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: APP_CONFIG.sync.supabaseAnonKey,
      Authorization: `Bearer ${APP_CONFIG.sync.supabaseAnonKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`supabase rpc failed: ${response.status}`);
  }

  return response.json();
}

function formatSyncTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }

  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function copyTextToClipboard(value) {
  if (!value) {
    return false;
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (error) {
      console.warn("Clipboard API 复制失败。", error);
    }
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "readonly");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(input);
  return copied;
}

function encodeFamilyToken(payload) {
  return btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeFamilyToken(value) {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return JSON.parse(atob(padded));
  } catch (error) {
    console.warn("家庭同步链接解析失败。", error);
    return null;
  }
}

function toMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatMinutes(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function hasScheduledTime(task) {
  return typeof task?.start === "number" && typeof task?.end === "number";
}

function formatTaskTime(task) {
  if (hasScheduledTime(task)) {
    return `${formatMinutes(task.start)} - ${formatMinutes(task.end)}`;
  }

  return `${task.duration} 分钟`;
}

function getTaskCountdownSeconds(task) {
  const startedAt = Number(task?.startedAt || 0);
  if (!startedAt) {
    return task.duration * 60;
  }

  const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
  return Math.max(0, task.duration * 60 - elapsedSeconds);
}

function formatCountdown(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
