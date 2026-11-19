(() => {
  "use strict";

  const STORAGE_KEY = "ritmo.data.v1";
  const MAX_TASKS_PER_DAY = 300;
  const MAX_DAYS = 4000;
  const $ = (selector) => document.querySelector(selector);
  const dateTitle = $("#date-title");
  const datePicker = $("#date-picker");
  const taskList = $("#task-list");
  const emptyState = $("#empty-state");
  const dialog = $("#duplicate-dialog");
  const sourceDate = $("#source-date");
  const dialogError = $("#dialog-error");
  const toast = $("#toast");
  const periodChart = $("#period-chart");

  const localDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const parseDateKey = (key) => {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || "");
    if (!parts) return null;
    const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    return localDateKey(date) === key ? date : null;
  };
  const todayKey = () => localDateKey(new Date());
  const makeId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  };

  let data;
  let selectedDate = todayKey();
  let selectedPeriod = "week";
  let toastTimer;

  function isTask(value) {
    return value && typeof value.id === "string" && typeof value.text === "string" &&
      value.text.length <= 120 && typeof value.done === "boolean";
  }

  function readData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, days: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !parsed.days || typeof parsed.days !== "object" || Array.isArray(parsed.days)) {
      throw new Error("Los datos guardados no tienen un formato válido.");
    }
    const days = {};
    for (const [key, tasks] of Object.entries(parsed.days)) {
      if (!parseDateKey(key) || !Array.isArray(tasks) || tasks.length > MAX_TASKS_PER_DAY || !tasks.every(isTask)) {
        throw new Error("Se encontró un registro de tareas inválido.");
      }
      days[key] = tasks;
    }
    if (Object.keys(days).length > MAX_DAYS) throw new Error("El historial guardado es demasiado grande.");
    return { version: 1, days };
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error("No se pudieron guardar las tareas localmente.", error);
      showToast("No se pudo guardar. Comprueba el espacio disponible.");
      return false;
    }
  }

  function getTasks(key = selectedDate) {
    return data.days[key] || [];
  }

  function formatDate(key, options) {
    const date = parseDateKey(key);
    return date.toLocaleDateString("es-ES", options);
  }

  function getPercentage(tasks) {
    if (!tasks.length) return 0;
    return Math.round((tasks.filter((task) => task.done).length / tasks.length) * 100);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  function renderTasks() {
    const tasks = getTasks();
    taskList.replaceChildren();
    emptyState.hidden = tasks.length > 0;
    for (const task of tasks) {
      const item = document.createElement("li");
      item.className = `task-row${task.done ? " is-done" : ""}`;

      const label = document.createElement("label");
      label.className = "task-main";
      const checkbox = document.createElement("input");
      checkbox.className = "sr-only";
      checkbox.type = "checkbox";
      checkbox.checked = task.done;
      checkbox.setAttribute("aria-label", `Marcar como ${task.done ? "no hecha" : "hecha"}: ${task.text}`);
      checkbox.addEventListener("change", () => updateTask(task.id, (entry) => { entry.done = checkbox.checked; }));

      const visualCheck = document.createElement("span");
      visualCheck.className = "task-check";
      visualCheck.setAttribute("aria-hidden", "true");
      visualCheck.textContent = "✓";
      const text = document.createElement("span");
      text.className = "task-text";
      text.textContent = task.text;
      label.append(checkbox, visualCheck, text);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-task";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Eliminar tarea: ${task.text}`);
      remove.addEventListener("click", () => removeTask(task.id));
      item.append(label, remove);
      taskList.append(item);
    }

    const done = tasks.filter((task) => task.done).length;
    const percentage = getPercentage(tasks);
    $("#progress-count").textContent = `${done} de ${tasks.length} ${tasks.length === 1 ? "tarea" : "tareas"}`;
    $("#progress-percent").textContent = `${percentage}%`;
    $("#progress-bar").value = percentage;
  }

  function renderDate() {
    dateTitle.textContent = formatDate(selectedDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    datePicker.value = selectedDate;
    renderTasks();
    renderStats();
  }

  function updateTask(id, change) {
    const tasks = getTasks();
    const task = tasks.find((entry) => entry.id === id);
    if (!task) return;
    const previousDone = task.done;
    change(task);
    if (!saveData()) {
      task.done = previousDone;
      return;
    }
    renderTasks();
    renderStats();
  }

  function removeTask(id) {
    const previous = getTasks();
    data.days[selectedDate] = previous.filter((task) => task.id !== id);
    if (!data.days[selectedDate].length) delete data.days[selectedDate];
    if (!saveData()) {
      data.days[selectedDate] = previous;
      return;
    }
    renderTasks();
    renderStats();
    showToast("Tarea eliminada");
  }

  function addTask(text) {
    const cleanText = text.trim();
    if (!cleanText) return false;
    if (getTasks().length >= MAX_TASKS_PER_DAY) {
      showToast("Has alcanzado el máximo de tareas para este día.");
      return false;
    }
    if (!data.days[selectedDate]) data.days[selectedDate] = [];
    const previous = data.days[selectedDate].slice();
    data.days[selectedDate].push({ id: makeId(), text: cleanText, done: false });
    if (!saveData()) {
      data.days[selectedDate] = previous;
      if (!previous.length) delete data.days[selectedDate];
      return false;
    }
    renderDate();
    return true;
  }

  function getRange(period, anchorKey) {
    const anchor = parseDateKey(anchorKey);
    const start = new Date(anchor);
    const end = new Date(anchor);
    if (period === "week") {
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      end.setTime(start.getTime());
      end.setDate(start.getDate() + 6);
    } else if (period === "month") {
      start.setDate(1);
      end.setMonth(end.getMonth() + 1, 0);
    }
    const days = [];
    for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
      const key = localDateKey(day);
      days.push({ key, tasks: getTasks(key) });
    }
    return days;
  }

  function renderStats() {
    const days = getRange(selectedPeriod, selectedDate);
    const trackedDays = days.filter((day) => day.tasks.length > 0);
    const total = trackedDays.reduce((sum, day) => sum + day.tasks.length, 0);
    const done = trackedDays.reduce((sum, day) => sum + day.tasks.filter((task) => task.done).length, 0);
    const percentage = total ? Math.round((done / total) * 100) : 0;
    const captions = { day: "Este día", week: "Esta semana", month: "Este mes" };
    $("#stats-percent").textContent = `${percentage}%`;
    $("#stats-caption").textContent = captions[selectedPeriod];
    $("#stats-detail").textContent = total
      ? `${done} de ${total} tareas completadas · ${trackedDays.length} ${trackedDays.length === 1 ? "día registrado" : "días registrados"}`
      : "Completa tareas para ver tu progreso.";

    periodChart.replaceChildren();
    periodChart.setAttribute("aria-label", `Progreso ${captions[selectedPeriod].toLowerCase()}: ${percentage} por ciento`);
    let chartDays = days;
    if (selectedPeriod === "month") {
      const monthStart = new Date(`${selectedDate.slice(0, 7)}-01T00:00:00`);
      const buckets = new Map();
      for (const day of days) {
        const date = parseDateKey(day.key);
        const week = Math.floor((date.getDate() - 1 + (monthStart.getDay() + 6) % 7) / 7);
        if (!buckets.has(week)) buckets.set(week, { key: day.key, tasks: [] });
        const bucket = buckets.get(week);
        bucket.tasks.push(...day.tasks);
      }
      chartDays = Array.from(buckets.values()).map((bucket, index) => ({
        ...bucket,
        key: `${selectedDate.slice(0, 7)}-${String(index + 1).padStart(2, "0")}`
      }));
    }

    for (const day of chartDays) {
      const percent = getPercentage(day.tasks);
      const column = document.createElement("div");
      const isSelected = day.key === selectedDate;
      column.className = `chart-day${isSelected ? " is-selected" : ""}${day.tasks.length ? "" : " is-empty"}`;
      const progress = document.createElement("progress");
      progress.className = "chart-progress";
      progress.max = 100;
      progress.value = Math.max(percent, day.tasks.length ? 7 : 0);
      progress.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "chart-label";
      label.textContent = selectedPeriod === "month"
        ? `S${parseDateKey(day.key).getDate()}`
        : formatDate(day.key, { weekday: "short" }).replace(".", "");
      const value = document.createElement("span");
      value.className = "chart-value";
      value.textContent = day.tasks.length ? `${percent}%` : "—";
      column.append(progress, label, value);
      periodChart.append(column);
    }
  }

  $("#add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#task-input");
    if (addTask(input.value)) input.value = "";
  });

  $("#previous-day").addEventListener("click", () => shiftSelectedDate(-1));
  $("#next-day").addEventListener("click", () => shiftSelectedDate(1));
  $("#today-button").addEventListener("click", () => {
    selectedDate = todayKey();
    renderDate();
  });
  datePicker.addEventListener("change", () => {
    if (parseDateKey(datePicker.value)) {
      selectedDate = datePicker.value;
      renderDate();
    }
  });

  function shiftSelectedDate(amount) {
    const date = parseDateKey(selectedDate);
    date.setDate(date.getDate() + amount);
    selectedDate = localDateKey(date);
    renderDate();
  }

  document.querySelectorAll(".period-switch button").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPeriod = button.dataset.period;
      document.querySelectorAll(".period-switch button").forEach((option) => {
        option.setAttribute("aria-pressed", String(option === button));
      });
      renderStats();
    });
  });

  $("#duplicate-button").addEventListener("click", () => {
    sourceDate.value = selectedDate;
    sourceDate.max = selectedDate;
    dialogError.hidden = true;
    dialog.showModal();
  });

  $("#confirm-duplicate").addEventListener("click", () => {
    const origin = parseDateKey(sourceDate.value);
    const sourceTasks = origin ? getTasks(sourceDate.value) : [];
    if (!origin || !sourceTasks.length) {
      dialogError.textContent = "Ese día no tiene tareas para duplicar.";
      dialogError.hidden = false;
      return;
    }
    const currentTasks = getTasks();
    if (currentTasks.length + sourceTasks.length > MAX_TASKS_PER_DAY) {
      dialogError.textContent = "No caben todas las tareas: este día alcanzaría el límite permitido.";
      dialogError.hidden = false;
      return;
    }
    if (sourceDate.value === selectedDate) {
      dialogError.textContent = "Elige un día diferente al que estás viendo.";
      dialogError.hidden = false;
      return;
    }
    const previous = currentTasks.slice();
    data.days[selectedDate] = currentTasks.concat(sourceTasks.map((task) => ({
      id: makeId(),
      text: task.text,
      done: false
    })));
    if (!saveData()) {
      if (previous.length) data.days[selectedDate] = previous;
      else delete data.days[selectedDate];
      return;
    }
    dialog.close();
    renderDate();
    showToast(`${sourceTasks.length} ${sourceTasks.length === 1 ? "tarea duplicada" : "tareas duplicadas"}`);
  });

  try {
    data = readData();
    renderDate();
  } catch (error) {
    console.error("No se pudieron leer las tareas guardadas.", error);
    $("#add-form").querySelectorAll("input, button").forEach((control) => { control.disabled = true; });
    $("#duplicate-button").disabled = true;
    showToast("No se pudieron leer los datos guardados. No se han modificado.");
  }

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("No se pudo activar el modo sin conexión.", error);
    });
  }
})();
