(() => {
  "use strict";

  const DATA = window.STEM_DATA;
  if (!DATA) {
    document.body.innerHTML =
      '<main style="padding:40px;font-family:sans-serif"><h1>数据加载失败</h1><p>请通过本地 HTTP 服务打开项目，并确认 assets/data/app-data.js 存在。</p></main>';
    return;
  }

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const DIMS = DATA.dimensions;
  const DIM_MAP = Object.fromEntries(DIMS.map((dim) => [dim.id, dim]));
  const STAGE_LABELS = {
    T1: "T1 · 初始测评",
    T2: "T2 · 阶段测评",
    T3: "T3 · 后续测评",
  };
  const SUPPORT_CLASS = {
    常规学习支持: "routine",
    针对性学习支持: "targeted",
    优先学习支持: "priority",
  };
  const PAGE_TITLES = {
    overview: "平台首页",
    data: "数据管理中心",
    profile: "STEM能力画像",
    lab: "数据挖掘实验室",
    learning: "个性化学习中心",
    career: "STEM职业探索",
    governance: "教师工作台与伦理治理",
  };
  const STORAGE = {
    feedback: "stemCompassFeedbackV1",
    reviews: "stemCompassTeacherReviewsV1",
    student: "stemCompassStudentV1",
  };
  const state = {
    page: "overview",
    studentId: readLocal(STORAGE.student, "ST001"),
    profileStage: "T3",
    dataStage: "T3",
    dataGrade: "all",
    dataSearch: "",
    dataPage: 1,
    dictionarySearch: "",
    week: 1,
    algorithm: "tree",
    labK: DATA.clustering.chosenK,
    clusterView: 0,
    assocSupport: 0.15,
    assocConfidence: 0.6,
    assocLift: 1.1,
    reviewSearch: "",
  };

  if (!DATA.students.some((student) => student.id === state.studentId)) {
    state.studentId = "ST001";
  }

  function readLocal(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function writeLocal(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      toast("浏览器未允许本地存储，当前操作仅在页面内生效");
    }
  }

  function studentById(id) {
    return DATA.students.find((student) => student.id === id) || DATA.students[0];
  }

  function currentStudent() {
    return studentById(state.studentId);
  }

  const num = (value, digits = 1) =>
    Number(value).toLocaleString("zh-CN", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  const pct = (value, digits = 1) => `${num(value * 100, digits)}%`;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (key === "class") node.className = value;
      else if (key === "style" && typeof value === "object") {
        Object.assign(node.style, value);
      } else if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value !== undefined && value !== null && value !== false) {
        node.setAttribute(key, value);
      }
    });
    children.flat().forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });
    return node;
  }

  function icon(id) {
    return `<svg aria-hidden="true"><use href="#i-${id}"></use></svg>`;
  }

  function svgEl(tag, attrs = {}, text = "") {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value !== undefined && value !== null) node.setAttribute(key, value);
    });
    if (text !== "") node.textContent = text;
    return node;
  }

  function toast(message) {
    const region = $("#toast-region");
    const node = el("div", { class: "toast" }, message);
    region.append(node);
    setTimeout(() => {
      node.style.opacity = "0";
      node.style.transform = "translateY(6px)";
      setTimeout(() => node.remove(), 200);
    }, 2600);
  }

  function bindTooltip(node, content) {
    const tooltip = $("#chart-tooltip");
    node.addEventListener("mouseenter", (event) => {
      tooltip.innerHTML = content;
      tooltip.classList.add("visible");
      placeTooltip(event);
    });
    node.addEventListener("mousemove", placeTooltip);
    node.addEventListener("mouseleave", () => tooltip.classList.remove("visible"));
  }

  function placeTooltip(event) {
    const tooltip = $("#chart-tooltip");
    const margin = 14;
    let x = event.clientX + margin;
    let y = event.clientY + margin;
    const rect = tooltip.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 10) x = event.clientX - rect.width - margin;
    if (y + rect.height > window.innerHeight - 10) y = event.clientY - rect.height - margin;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }

  function createSvg(container, width, height, label) {
    container.innerHTML = "";
    const svg = svgEl("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": label,
      preserveAspectRatio: "xMidYMid meet",
    });
    container.append(svg);
    return svg;
  }

  function addSvgText(svg, x, y, text, attrs = {}) {
    const node = svgEl(
      "text",
      {
        x,
        y,
        fill: "#718096",
        "font-family": "inherit",
        "font-size": 10,
        ...attrs,
      },
      text,
    );
    svg.append(node);
    return node;
  }

  function barChart(container, items, options = {}) {
    const width = options.width || 760;
    const height = options.height || 285;
    const margin = { top: 24, right: 24, bottom: 48, left: 48 };
    const svg = createSvg(container, width, height, options.label || "柱状图");
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const max = options.max || 100;
    const ticks = options.ticks || [0, 25, 50, 75, 100];
    ticks.forEach((tick) => {
      const y = margin.top + innerHeight - (tick / max) * innerHeight;
      svg.append(
        svgEl("line", {
          x1: margin.left,
          x2: width - margin.right,
          y1: y,
          y2: y,
          stroke: "#e8edf3",
          "stroke-width": 1,
        }),
      );
      addSvgText(svg, margin.left - 9, y + 3, String(tick), {
        "text-anchor": "end",
        "font-size": 8,
      });
    });
    const slot = innerWidth / items.length;
    const barWidth = Math.min(options.barWidth || 58, slot * 0.55);
    items.forEach((item, index) => {
      const value = clamp(Number(item.value), 0, max);
      const x = margin.left + slot * index + (slot - barWidth) / 2;
      const barHeight = (value / max) * innerHeight;
      const y = margin.top + innerHeight - barHeight;
      const rect = svgEl("rect", {
        x,
        y,
        width: barWidth,
        height: barHeight,
        rx: 7,
        fill: item.color || "#1570ef",
        opacity: 0.88,
        tabindex: 0,
      });
      bindTooltip(
        rect,
        `<strong>${item.label}</strong><br>${item.tooltip || `${num(item.value)} 分`}`,
      );
      svg.append(rect);
      addSvgText(svg, x + barWidth / 2, y - 8, item.display || num(value), {
        "text-anchor": "middle",
        fill: "#253b53",
        "font-size": 9,
        "font-weight": 700,
      });
      addSvgText(svg, x + barWidth / 2, height - 20, item.label, {
        "text-anchor": "middle",
        fill: "#6d7d90",
        "font-size": 9,
      });
    });
    return svg;
  }

  function horizontalBars(container, items, options = {}) {
    const width = options.width || 700;
    const height = options.height || Math.max(160, items.length * 35 + 28);
    const svg = createSvg(container, width, height, options.label || "横向条形图");
    const left = options.left || 155;
    const right = 50;
    const max = options.max || 100;
    const slot = (height - 24) / items.length;
    items.forEach((item, index) => {
      const y = 13 + index * slot;
      const barY = y + slot / 2 - 5;
      addSvgText(svg, left - 10, y + slot / 2 + 3, item.label, {
        "text-anchor": "end",
        fill: "#41546b",
        "font-size": 9,
      });
      svg.append(
        svgEl("rect", {
          x: left,
          y: barY,
          width: width - left - right,
          height: 10,
          rx: 5,
          fill: "#edf1f5",
        }),
      );
      const rect = svgEl("rect", {
        x: left,
        y: barY,
        width: ((width - left - right) * clamp(item.value, 0, max)) / max,
        height: 10,
        rx: 5,
        fill: item.color || "#1570ef",
      });
      bindTooltip(rect, `<strong>${item.label}</strong><br>${item.tooltip || num(item.value)}`);
      svg.append(rect);
      addSvgText(svg, width - right + 5, y + slot / 2 + 3, item.display || num(item.value), {
        fill: "#253b53",
        "font-size": 9,
        "font-weight": 700,
      });
    });
    return svg;
  }

  function lineChart(container, series, options = {}) {
    const width = options.width || 720;
    const height = options.height || 285;
    const margin = { top: 30, right: 35, bottom: 42, left: 44 };
    const svg = createSvg(container, width, height, options.label || "折线图");
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const minY = options.minY ?? 40;
    const maxY = options.maxY ?? 100;
    const yTicks = options.yTicks || [40, 55, 70, 85, 100];
    const points = series.map((item, index) => ({
      ...item,
      x: margin.left + (innerWidth * index) / Math.max(series.length - 1, 1),
      y:
        item.value === null
          ? null
          : margin.top + innerHeight - ((item.value - minY) / (maxY - minY)) * innerHeight,
    }));
    yTicks.forEach((tick) => {
      const y = margin.top + innerHeight - ((tick - minY) / (maxY - minY)) * innerHeight;
      svg.append(
        svgEl("line", {
          x1: margin.left,
          x2: width - margin.right,
          y1: y,
          y2: y,
          stroke: "#e8edf3",
        }),
      );
      addSvgText(svg, margin.left - 8, y + 3, String(tick), {
        "text-anchor": "end",
        "font-size": 8,
      });
    });
    const visible = points.filter((point) => point.y !== null);
    if (visible.length > 1) {
      const path = visible.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
      svg.append(
        svgEl("path", {
          d: path,
          fill: "none",
          stroke: options.color || "#1570ef",
          "stroke-width": 2.5,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        }),
      );
      const area = `${path} L${visible.at(-1).x},${margin.top + innerHeight} L${visible[0].x},${margin.top + innerHeight} Z`;
      svg.append(
        svgEl("path", {
          d: area,
          fill: options.color || "#1570ef",
          opacity: 0.07,
        }),
      );
    }
    points.forEach((point) => {
      if (point.y !== null) {
        const circle = svgEl("circle", {
          cx: point.x,
          cy: point.y,
          r: 5.5,
          fill: "#fff",
          stroke: options.color || "#1570ef",
          "stroke-width": 2.5,
          tabindex: 0,
        });
        bindTooltip(circle, `<strong>${point.label}</strong><br>${num(point.value, 2)} 分`);
        svg.append(circle);
        addSvgText(svg, point.x, point.y - 14, num(point.value, 1), {
          "text-anchor": "middle",
          fill: "#17334f",
          "font-size": 9,
          "font-weight": 700,
        });
      } else {
        svg.append(
          svgEl("circle", {
            cx: point.x,
            cy: margin.top + innerHeight / 2,
            r: 4,
            fill: "#f4f7fb",
            stroke: "#c4cfdb",
            "stroke-dasharray": "3 3",
          }),
        );
        addSvgText(svg, point.x, margin.top + innerHeight / 2 + 18, "尚未到达", {
          "text-anchor": "middle",
          fill: "#a2afbd",
          "font-size": 8,
        });
      }
      addSvgText(svg, point.x, height - 18, point.shortLabel || point.label, {
        "text-anchor": "middle",
        fill: "#68798d",
        "font-size": 9,
      });
    });
    return svg;
  }

  function radarChart(container, values, compareValues = null, options = {}) {
    const width = options.width || 480;
    const height = options.height || 400;
    const cx = width / 2;
    const cy = height / 2 + 8;
    const radius = Math.min(width, height) * 0.31;
    const svg = createSvg(container, width, height, options.label || "六维能力雷达图");
    const angles = DIMS.map((_, index) => -Math.PI / 2 + (Math.PI * 2 * index) / DIMS.length);
    const min = 20;
    const max = 100;
    [25, 50, 75, 100].forEach((ring) => {
      const r = radius * (ring / 100);
      const points = angles
        .map((angle) => `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`)
        .join(" ");
      svg.append(
        svgEl("polygon", {
          points,
          fill: "none",
          stroke: "#e1e8f0",
          "stroke-width": 1,
        }),
      );
    });
    angles.forEach((angle) => {
      svg.append(
        svgEl("line", {
          x1: cx,
          y1: cy,
          x2: cx + Math.cos(angle) * radius,
          y2: cy + Math.sin(angle) * radius,
          stroke: "#e5ebf2",
        }),
      );
    });

    const polygonFor = (data) =>
      angles
        .map((angle, index) => {
          const r = radius * ((data[index] - min) / (max - min));
          return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`;
        })
        .join(" ");

    if (compareValues) {
      svg.append(
        svgEl("polygon", {
          points: polygonFor(compareValues),
          fill: "#94a3b8",
          "fill-opacity": 0.09,
          stroke: "#9aabba",
          "stroke-width": 1.2,
          "stroke-dasharray": "5 4",
        }),
      );
    }
    svg.append(
      svgEl("polygon", {
        points: polygonFor(values),
        fill: options.color || "#1570ef",
        "fill-opacity": 0.14,
        stroke: options.color || "#1570ef",
        "stroke-width": 2.3,
      }),
    );

    DIMS.forEach((dim, index) => {
      const angle = angles[index];
      const r = radius * ((values[index] - min) / (max - min));
      const circle = svgEl("circle", {
        cx: cx + Math.cos(angle) * r,
        cy: cy + Math.sin(angle) * r,
        r: 4.5,
        fill: "#fff",
        stroke: options.color || "#1570ef",
        "stroke-width": 2,
        tabindex: 0,
      });
      bindTooltip(
        circle,
        `<strong>${dim.zh} / ${dim.en}</strong><br>当前 ${num(values[index], 2)} 分${
          compareValues ? `<br>群体参考 ${num(compareValues[index], 2)} 分` : ""
        }`,
      );
      svg.append(circle);
      const labelRadius = radius + 31;
      const lx = cx + Math.cos(angle) * labelRadius;
      const ly = cy + Math.sin(angle) * labelRadius;
      const text = svgEl("text", {
        x: lx,
        y: ly,
        "text-anchor": Math.abs(Math.cos(angle)) < 0.18 ? "middle" : Math.cos(angle) > 0 ? "start" : "end",
        fill: "#3e5269",
        "font-size": 10,
        "font-weight": 700,
      });
      text.append(
        svgEl("tspan", { x: lx, dy: 0 }, `${dim.id} · ${dim.zh}`),
        svgEl("tspan", {
          x: lx,
          dy: 13,
          fill: "#94a2b2",
          "font-size": 8,
          "font-weight": 500,
        }, num(values[index], 1)),
      );
      svg.append(text);
    });
    return svg;
  }

  function scatterChart(container, points, options = {}) {
    const width = options.width || 720;
    const height = options.height || 330;
    const margin = { top: 25, right: 25, bottom: 44, left: 52 };
    const svg = createSvg(container, width, height, options.label || "散点图");
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const xMin = options.xMin ?? Math.min(...points.map((point) => point.x)) - 1;
    const xMax = options.xMax ?? Math.max(...points.map((point) => point.x)) + 1;
    const yMin = options.yMin ?? Math.min(...points.map((point) => point.y)) - 1;
    const yMax = options.yMax ?? Math.max(...points.map((point) => point.y)) + 1;
    const xScale = (value) => margin.left + ((value - xMin) / (xMax - xMin)) * innerWidth;
    const yScale = (value) => margin.top + innerHeight - ((value - yMin) / (yMax - yMin)) * innerHeight;

    for (let i = 0; i <= 4; i += 1) {
      const xTick = xMin + ((xMax - xMin) * i) / 4;
      const yTick = yMin + ((yMax - yMin) * i) / 4;
      const px = xScale(xTick);
      const py = yScale(yTick);
      svg.append(
        svgEl("line", { x1: px, x2: px, y1: margin.top, y2: margin.top + innerHeight, stroke: "#edf1f5" }),
        svgEl("line", { x1: margin.left, x2: margin.left + innerWidth, y1: py, y2: py, stroke: "#edf1f5" }),
      );
      addSvgText(svg, px, height - 20, num(xTick, 0), { "text-anchor": "middle", "font-size": 8 });
      addSvgText(svg, margin.left - 8, py + 3, num(yTick, 0), {
        "text-anchor": "end",
        "font-size": 8,
      });
    }
    if (options.diagonal) {
      svg.append(
        svgEl("line", {
          x1: xScale(xMin),
          y1: yScale(yMin),
          x2: xScale(xMax),
          y2: yScale(yMax),
          stroke: "#9eacba",
          "stroke-dasharray": "5 4",
        }),
      );
    }
    if (options.zeroY && yMin < 0 && yMax > 0) {
      svg.append(
        svgEl("line", {
          x1: margin.left,
          x2: margin.left + innerWidth,
          y1: yScale(0),
          y2: yScale(0),
          stroke: "#8a9aad",
        }),
      );
    }
    points.forEach((point) => {
      const circle = svgEl("circle", {
        cx: xScale(point.x),
        cy: yScale(point.y),
        r: options.radius || 4.6,
        fill: point.color || options.color || "#1570ef",
        opacity: options.opacity || 0.72,
        stroke: "#fff",
        "stroke-width": 1,
        tabindex: 0,
      });
      bindTooltip(circle, point.tooltip || `${num(point.x, 2)}, ${num(point.y, 2)}`);
      svg.append(circle);
    });
    addSvgText(svg, width - margin.right, height - 4, options.xLabel || "", {
      "text-anchor": "end",
      fill: "#68798d",
      "font-size": 9,
    });
    addSvgText(svg, 4, margin.top - 9, options.yLabel || "", {
      fill: "#68798d",
      "font-size": 9,
    });
    return svg;
  }

  function heatmapMatrix(container, labels, matrix) {
    const max = Math.max(...matrix.flat());
    const node = el("div", { class: "confusion-grid" });
    node.append(el("div", { class: "confusion-cell header" }, "实际 ↓ / 预测 →"));
    labels.forEach((label) => node.append(el("div", { class: "confusion-cell header" }, label)));
    matrix.forEach((row, rowIndex) => {
      node.append(el("div", { class: "confusion-cell label" }, labels[rowIndex]));
      row.forEach((value, columnIndex) => {
        const intensity = max ? value / max : 0;
        const cell = el(
          "div",
          {
            class: "confusion-cell",
            style: {
              color: intensity > 0.55 ? "#fff" : "#0b2545",
              background: `rgba(21,112,239,${0.08 + intensity * 0.78})`,
            },
          },
          value,
        );
        bindTooltip(cell, `实际：${labels[rowIndex]}<br>预测：${labels[columnIndex]}<br>人数：${value}`);
        node.append(cell);
      });
    });
    container.innerHTML = "";
    container.append(node);
  }

  function treeDiagram(container, root) {
    const leaves = [];
    let maxDepth = 0;
    const layout = [];
    function walk(node, depth) {
      maxDepth = Math.max(maxDepth, depth);
      if (node.leaf) {
        node.xIndex = leaves.length;
        leaves.push(node);
        layout.push({ node, depth });
        return (node.xIndex + 0.5) / 1;
      }
      walk(node.left, depth + 1);
      walk(node.right, depth + 1);
      layout.push({ node, depth });
    }
    walk(root, 0);
    // Recalculate centers after leaf indexes are known.
    function center(node) {
      if (node.leaf) {
        node.center = node.xIndex + 0.5;
        return node.center;
      }
      node.center = (center(node.left) + center(node.right)) / 2;
      return node.center;
    }
    center(root);
    const nodeWidth = 154;
    const nodeHeight = 64;
    const gapX = 18;
    const gapY = 46;
    const width = Math.max(900, leaves.length * (nodeWidth + gapX) + 36);
    const height = (maxDepth + 1) * (nodeHeight + gapY) + 35;
    const svg = createSvg(container, width, height, "决策树结构图");
    const xFor = (node) => 18 + node.center * (nodeWidth + gapX) - nodeWidth / 2;
    const yFor = (depth) => 18 + depth * (nodeHeight + gapY);

    function connect(parent, child, depth) {
      const x1 = xFor(parent) + nodeWidth / 2;
      const y1 = yFor(depth) + nodeHeight;
      const x2 = xFor(child) + nodeWidth / 2;
      const y2 = yFor(depth + 1);
      svg.append(
        svgEl("path", {
          d: `M${x1},${y1} C${x1},${y1 + 22} ${x2},${y2 - 22} ${x2},${y2}`,
          fill: "none",
          stroke: "#c5d2e0",
          "stroke-width": 1,
        }),
      );
    }
    function drawNode(node, depth) {
      const x = xFor(node);
      const y = yFor(depth);
      if (!node.leaf) {
        connect(node, node.left, depth);
        connect(node, node.right, depth);
        drawNode(node.left, depth + 1);
        drawNode(node.right, depth + 1);
      }
      const fill = node.leaf ? "#effaf8" : depth === 0 ? "#eaf2ff" : "#f7f9fc";
      const stroke = node.leaf ? "#8fd0cb" : depth === 0 ? "#86b6ef" : "#d3dfeb";
      const group = svgEl("g", { tabindex: 0 });
      group.append(
        svgEl("rect", {
          x,
          y,
          width: nodeWidth,
          height: nodeHeight,
          rx: 8,
          fill,
          stroke,
          "stroke-width": 1,
        }),
      );
      const line1 = node.leaf ? "预测类别" : node.featureLabel.slice(0, 19);
      const line2 = node.leaf
        ? node.prediction
        : `≤ ${node.threshold}`;
      const line3 = `n=${node.samples}`;
      [line1, line2, line3].forEach((text, index) => {
        addSvgText(group, x + nodeWidth / 2, y + 20 + index * 15, text, {
          "text-anchor": "middle",
          fill: index === 2 ? "#8392a4" : "#253b53",
          "font-size": index === 1 ? 8.5 : 9,
          "font-weight": index === 2 ? 500 : 650,
        });
      });
      const hit = svgEl("rect", {
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
        fill: "transparent",
      });
      bindTooltip(
        hit,
        node.leaf
          ? `<strong>${node.prediction}</strong><br>样本数 ${node.samples}<br>各类别计数 ${node.values.join(" / ")}`
          : `<strong>${node.featureLabel}</strong><br>阈值 ≤ ${node.threshold}<br>样本数 ${node.samples}`,
      );
      group.append(hit);
      svg.append(group);
    }
    drawNode(root, 0);
  }

  function supportClass(label) {
    return SUPPORT_CLASS[label] || "routine";
  }

  function supportLabel(label) {
    return el("span", { class: `support-label ${supportClass(label)}` }, label);
  }

  function initNavigation() {
    $$(".nav-item, [data-go]").forEach((node) => {
      node.addEventListener("click", (event) => {
        const page = node.dataset.page || node.dataset.go;
        if (!page) return;
        event.preventDefault();
        if (location.hash !== `#${page}`) location.hash = page;
        else navigate(page);
      });
    });
    window.addEventListener("hashchange", () => {
      const page = location.hash.replace("#", "") || "overview";
      navigate(page);
    });
    $("#menu-button").addEventListener("click", () => {
      $("#sidebar").classList.add("open");
      $("#sidebar-backdrop").classList.add("visible");
    });
    $("#sidebar-backdrop").addEventListener("click", closeSidebar);
    $$(".nav-item").forEach((node) => node.addEventListener("click", closeSidebar));
  }

  function closeSidebar() {
    $("#sidebar").classList.remove("open");
    $("#sidebar-backdrop").classList.remove("visible");
  }

  function navigate(page) {
    if (!PAGE_TITLES[page]) page = "overview";
    state.page = page;
    $$(".page").forEach((node) => node.classList.toggle("active", node.dataset.page === page));
    $$(".nav-item").forEach((node) => node.classList.toggle("active", node.dataset.page === page));
    $("#breadcrumb-title").textContent = PAGE_TITLES[page];
    closeSidebar();
    renderPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function initStudentSelectors() {
    const options = DATA.students
      .map(
        (student) =>
          `<option value="${student.id}">${student.id} · ${student.grade}年级</option>`,
      )
      .join("");
    $$("#global-student-select, #profile-student-select, #learning-student-select, #career-student-select")
      .forEach((select) => {
        select.innerHTML = options;
        select.value = state.studentId;
        select.addEventListener("change", (event) => setStudent(event.target.value));
      });
    renderReviewStudentOptions();
  }

  function setStudent(id) {
    state.studentId = id;
    state.week = 1;
    writeLocal(STORAGE.student, id);
    $$("#global-student-select, #profile-student-select, #learning-student-select, #career-student-select")
      .forEach((select) => {
        select.value = id;
      });
    const reviewSelect = $("#review-student-select");
    if (reviewSelect && [...reviewSelect.options].some((option) => option.value === id)) {
      reviewSelect.value = id;
    }
    renderPage(state.page);
  }

  function renderPage(page) {
    if (page === "overview") renderOverview();
    if (page === "data") renderDataPage();
    if (page === "profile") renderProfilePage();
    if (page === "lab") renderLabPage();
    if (page === "learning") renderLearningPage();
    if (page === "career") renderCareerPage();
    if (page === "governance") renderGovernancePage();
  }

  function groupMean(stage, grade = null) {
    const students = DATA.students.filter((student) => grade === null || student.grade === grade);
    return Object.fromEntries(
      DIMS.map((dim) => [
        dim.id,
        students.reduce((sum, student) => sum + student.stages[stage].dimensions[dim.id], 0) /
          students.length,
      ]),
    );
  }

  function renderOverview() {
    const student = currentStudent();
    const t3 = student.stages.T3;
    $("#hero-s-score").textContent = num(t3.dimensions.S, 1);
    $("#hero-e-score").textContent = num(t3.dimensions.E, 1);
    $("#hero-cluster").textContent = student.clusterName.replace("相对突出型", "型");
    const means = groupMean("T3");
    const dimensionGrid = $("#overview-dimensions");
    dimensionGrid.innerHTML = "";
    DIMS.forEach((dim) => {
      const score = means[dim.id];
      const card = el(
        "div",
        { class: "dimension-card" },
        el(
          "div",
          { class: "dimension-card-top" },
          el(
            "span",
            { class: "dimension-letter", style: { background: dim.color } },
            dim.id,
          ),
          el("strong", {}, num(score, 1)),
        ),
        el("small", { title: dim.en }, dim.zh),
        el(
          "div",
          { class: "dimension-bar" },
          el("i", {
            style: { width: `${score}%`, background: dim.color },
          }),
        ),
      );
      bindTooltip(
        card,
        `<strong>${dim.id} · ${dim.zh}</strong><br>${dim.en}<br>200 名学生 T3 均值：${num(score, 2)}`,
      );
      dimensionGrid.append(card);
    });
    const qualityList = $("#overview-quality-list");
    qualityList.innerHTML = "";
    [
      ["原始记录", `${DATA.meta.recordCount} 条`],
      ["二级指标观测", `${DATA.meta.indicatorCount * DATA.meta.studentCount} 项`],
      ["原始缺失值", `${DATA.missingComparison.before} 项`],
      ["清洗后缺失", `${DATA.missingComparison.after} 项`],
      ["插补审计记录", `${DATA.missingComparison.rowsImputed} 条`],
    ].forEach(([label, value]) => {
      qualityList.append(
        el("div", { class: "snapshot-row" }, el("span", {}, label), el("strong", {}, value)),
      );
    });
    const metrics = DATA.classification.metrics;
    const regression = DATA.regression.metrics;
    const algorithms = [
      {
        index: "01 · CLASSIFICATION",
        title: "决策树分类",
        en: "Decision Tree",
        description: "以 T1/T2 特征估计后续学习支持需求，输出可解释树结构。",
        value: `Accuracy ${num(metrics.accuracy, 3)}`,
        page: "lab",
      },
      {
        index: "02 · REGRESSION",
        title: "线性回归",
        en: "Linear Regression",
        description: "预测下一阶段综合能力得分，并报告 MAE、RMSE 与 R²。",
        value: `R² ${num(regression.r2, 3)}`,
        page: "lab",
      },
      {
        index: "03 · CLUSTERING",
        title: "K-means 聚类",
        en: "K-means Clustering",
        description: "比较 K=2–6，识别具有相似能力结构的学生群体。",
        value: `K = ${DATA.clustering.chosenK}`,
        page: "lab",
      },
      {
        index: "04 · ASSOCIATION",
        title: "Apriori 关联规则",
        en: "Association Rules",
        description: "发现学习行为与能力表现经常共同出现的可解释模式。",
        value: `${DATA.association.primaryRuleCount} 条规则`,
        page: "lab",
      },
    ];
    const algGrid = $("#overview-algorithms");
    algGrid.innerHTML = "";
    algorithms.forEach((item) => {
      const card = el(
        "article",
        { class: "algorithm-card" },
        el("span", {}, item.index),
        el("h3", {}, item.title),
        el("small", {}, item.en),
        el("p", {}, item.description),
        el(
          "div",
          { class: "algorithm-result" },
          el("strong", {}, item.value),
          el("span", {}, "真实运行结果"),
        ),
      );
      card.addEventListener("click", () => {
        location.hash = "lab";
      });
      algGrid.append(card);
    });
    const workflow = [
      ["01", "多源数据采集", "能力测评 + 学习行为"],
      ["02", "数据预处理", "缺失审计与插补"],
      ["03", "六维能力评价", "STEM-6 等权框架"],
      ["04", "数据挖掘分析", "分类 / 回归 / 聚类 / 关联"],
      ["05", "个性化推荐", "透明规则生成任务"],
      ["06", "教师审核", "批准 / 修改 / 暂缓"],
      ["07", "动态反馈", "学生反馈与计划更新"],
    ];
    const track = $("#workflow-track");
    track.innerHTML = "";
    workflow.forEach(([index, title, description]) => {
      track.append(
        el(
          "div",
          { class: "workflow-step" },
          el("span", { class: "workflow-dot" }, index),
          el("strong", {}, title),
          el("small", {}, description),
        ),
      );
    });
  }

  function renderDataPage() {
    $("#data-missing-before").textContent = DATA.missingComparison.before;
    $("#data-missing-after").textContent = DATA.missingComparison.after;
    $("#data-imputed-rows").textContent = `${DATA.missingComparison.rowsImputed} 条记录发生插补`;
    const gradeCounts = [7, 8, 9].map((grade) => ({
      label: `${grade}年级`,
      value: DATA.students.filter((student) => student.grade === grade).length,
      color: ["#1570ef", "#0ea5a4", "#7c5cfc"][grade - 7],
      tooltip: `${grade} 年级学生人数`,
    }));
    barChart($("#grade-chart"), gradeCounts, {
      width: 520,
      height: 230,
      max: 80,
      ticks: [0, 20, 40, 60, 80],
      barWidth: 64,
      label: "各年级人数分布",
    });
    const missing = $("#missing-compare");
    missing.innerHTML = "";
    missing.append(
      el(
        "div",
        { class: "missing-box before" },
        el("span", {}, "清洗前"),
        el("strong", {}, DATA.missingComparison.before),
        el("small", {}, "指标 + 行为字段"),
      ),
      el("div", { class: "missing-arrow" }, "→"),
      el(
        "div",
        { class: "missing-box after" },
        el("span", {}, "清洗后"),
        el("strong", {}, DATA.missingComparison.after),
        el("small", {}, "全部可追溯"),
      ),
    );
    const stage = $("#data-stage-select");
    stage.value = state.dataStage;
    stage.onchange = () => {
      state.dataStage = stage.value;
      renderDataPage();
    };
    const gradeFilter = $("#data-grade-select");
    gradeFilter.value = state.dataGrade;
    gradeFilter.onchange = () => {
      state.dataGrade = gradeFilter.value;
      state.dataPage = 1;
      renderDataPage();
    };
    const search = $("#data-search");
    search.value = state.dataSearch;
    search.oninput = () => {
      state.dataSearch = search.value.trim().toUpperCase();
      state.dataPage = 1;
      renderDataTable();
    };
    const stageStudents = DATA.students.filter(
      (student) =>
        (state.dataGrade === "all" || String(student.grade) === state.dataGrade) &&
        (!state.dataSearch || student.id.includes(state.dataSearch)),
    );
    const dimensionMeans = Object.fromEntries(
      DIMS.map((dim) => [
        dim.id,
        stageStudents.length
          ? stageStudents.reduce(
              (sum, student) => sum + student.stages[state.dataStage].dimensions[dim.id],
              0,
            ) / stageStudents.length
          : 0,
      ]),
    );
    horizontalBars(
      $("#data-dimension-chart"),
      DIMS.map((dim) => ({
        label: `${dim.id} · ${dim.zh}`,
        value: dimensionMeans[dim.id],
        color: dim.color,
        tooltip: `${STAGE_LABELS[state.dataStage]} · ${stageStudents.length} 名筛选学生均值`,
      })),
      { width: 900, left: 150, height: 270, label: "六维能力分布" },
    );
    renderDataTable();
    renderDictionary();
  }

  function filteredDataStudents() {
    return DATA.students.filter(
      (student) =>
        (state.dataGrade === "all" || String(student.grade) === state.dataGrade) &&
        (!state.dataSearch || student.id.includes(state.dataSearch)),
    );
  }

  function renderDataTable() {
    const students = filteredDataStudents();
    const pageSize = 12;
    const pages = Math.max(1, Math.ceil(students.length / pageSize));
    state.dataPage = clamp(state.dataPage, 1, pages);
    const start = (state.dataPage - 1) * pageSize;
    const visible = students.slice(start, start + pageSize);
    const table = $("#data-student-table");
    const head = table.tHead;
    const body = table.tBodies[0];
    head.innerHTML = `<tr>
      <th>学生编号</th><th>年级</th><th>综合能力</th>${DIMS.map((dim) => `<th>${dim.id}</th>`).join("")}<th>T3支持需求</th><th>数据质量</th>
    </tr>`;
    body.innerHTML = "";
    visible.forEach((student) => {
      const stage = student.stages[state.dataStage];
      const row = el("tr");
      row.append(
        el(
          "td",
          {},
          el(
            "span",
            {
              class: "student-link",
              onclick: () => {
                setStudent(student.id);
                location.hash = "profile";
              },
            },
            student.id,
          ),
        ),
        el("td", {}, `${student.grade} 年级`),
        el(
          "td",
          {},
          el(
            "div",
            { class: "mini-score" },
            num(stage.overall, 2),
            el(
              "span",
              { class: "mini-score-bar" },
              el("i", { style: { width: `${stage.overall}%` } }),
            ),
          ),
        ),
        ...DIMS.map((dim) => el("td", {}, num(stage.dimensions[dim.id], 1))),
        el(
          "td",
          {},
          state.dataStage === "T3"
            ? supportLabel(student.supportNeed)
            : el("span", { style: { color: "#9aa8b8" } }, "T3 后形成"),
        ),
        el(
          "td",
          {},
          stage.qualityFlag === "complete"
            ? el("span", { class: "support-label routine" }, "完整")
            : el("span", { class: "support-label targeted" }, `插补 ${stage.imputationCount} 项`),
        ),
      );
      body.append(row);
    });
    $("#data-filter-count").textContent = `筛选结果 ${students.length} 名学生 · ${STAGE_LABELS[state.dataStage]}`;
    const pagination = $("#data-pagination");
    pagination.innerHTML = "";
    const previous = el(
      "button",
      {
        class: "page-button",
        disabled: state.dataPage === 1,
        onclick: () => {
          state.dataPage -= 1;
          renderDataTable();
        },
      },
      "‹",
    );
    pagination.append(previous);
    const pageWindow = [];
    for (let page = 1; page <= pages; page += 1) {
      if (page <= 2 || page > pages - 2 || Math.abs(page - state.dataPage) <= 1) pageWindow.push(page);
    }
    let last = 0;
    pageWindow.forEach((page) => {
      if (last && page - last > 1) pagination.append(el("span", { class: "page-button" }, "…"));
      pagination.append(
        el(
          "button",
          {
            class: `page-button ${page === state.dataPage ? "active" : ""}`,
            onclick: () => {
              state.dataPage = page;
              renderDataTable();
            },
          },
          page,
        ),
      );
      last = page;
    });
    const next = el(
      "button",
      {
        class: "page-button",
        disabled: state.dataPage === pages,
        onclick: () => {
          state.dataPage += 1;
          renderDataTable();
        },
      },
      "›",
    );
    pagination.append(next);
  }

  function renderDictionary() {
    const search = $("#dictionary-search");
    search.value = state.dictionarySearch;
    search.oninput = () => {
      state.dictionarySearch = search.value.trim().toLowerCase();
      renderDictionaryRows();
    };
    renderDictionaryRows();
  }

  function renderDictionaryRows() {
    const rows = DATA.dataDictionary.filter((row) =>
      Object.values(row).join(" ").toLowerCase().includes(state.dictionarySearch),
    );
    const body = $("#dictionary-table").tBodies[0];
    body.innerHTML = "";
    rows.forEach((row) => {
      body.append(
        el(
          "tr",
          {},
          el("td", {}, row.field_name),
          el("td", {}, row.meaning),
          el("td", {}, row.unit),
          el("td", {}, row.range),
          el("td", {}, row.purpose),
        ),
      );
    });
  }

  function sortedDimensions(stage, student = currentStudent(), reverse = false) {
    return [...DIMS]
      .map((dim) => ({ ...dim, score: student.stages[stage].dimensions[dim.id] }))
      .sort((a, b) => (reverse ? b.score - a.score : a.score - b.score));
  }

  function renderProfilePage() {
    const student = currentStudent();
    const stageKey = state.profileStage;
    const stage = student.stages[stageKey];
    const previousStage = stageKey === "T3" ? "T2" : stageKey === "T2" ? "T1" : null;
    const growth = previousStage
      ? stage.overall - student.stages[previousStage].overall
      : null;
    const stageSelect = $("#profile-stage-select");
    stageSelect.value = stageKey;
    stageSelect.onchange = () => {
      state.profileStage = stageSelect.value;
      renderProfilePage();
    };
    $("#profile-student-select").value = student.id;

    const identity = $("#profile-identity");
    identity.innerHTML = "";
    const clusterAvailable = stageKey === "T3";
    identity.append(
      el(
        "div",
        { class: "identity-main" },
        el("div", { class: "student-avatar" }, student.id.slice(-3)),
        el(
          "div",
          {},
          el("h2", {}, `学生 ${student.id}`),
          el(
            "p",
            {},
            `${student.grade} 年级 · ${STAGE_LABELS[stageKey]} · ${
              clusterAvailable ? student.clusterName : "T3 群体结构尚未到达"
            }`,
          ),
        ),
      ),
      el(
        "div",
        { class: "identity-kpi" },
        el("span", {}, "综合能力"),
        el("strong", {}, num(stage.overall, 1)),
        el("small", {}, "六维等权平均"),
      ),
      el(
        "div",
        { class: "identity-kpi" },
        el("span", {}, previousStage ? "阶段变化" : "轨迹状态"),
        el(
          "strong",
          { style: { color: growth !== null && growth < 0 ? "#e85d75" : "#0b8f91" } },
          growth === null ? "起始" : `${growth >= 0 ? "+" : ""}${num(growth, 1)}`,
        ),
        el("small", {}, previousStage ? `${previousStage} → ${stageKey}` : "T1 初始测评"),
      ),
      el(
        "div",
        { class: "identity-kpi" },
        el("span", {}, "支持需求"),
        el("strong", { style: { fontSize: "15px" } }, stageKey === "T3" ? student.supportNeed : "待模型估计"),
        el("small", {}, stageKey === "T3" ? "T3 规则标签" : "尚未形成 T3 结果"),
      ),
      el(
        "div",
        { class: "identity-kpi" },
        el("span", {}, "数据质量"),
        el("strong", {}, stage.qualityFlag === "complete" ? "完整" : "已插补"),
        el("small", {}, `${stage.imputationCount} 项字段经审计处理`),
      ),
    );

    const values = DIMS.map((dim) => stage.dimensions[dim.id]);
    const referenceMap = groupMean(stageKey, student.grade);
    const reference = DIMS.map((dim) => referenceMap[dim.id]);
    radarChart($("#profile-radar"), values, reference, {
      width: 520,
      height: 395,
      color: "#1570ef",
      label: `${student.id} ${stageKey} 六维能力雷达`,
    });
    $("#profile-radar-stage").textContent = stageKey;

    const ascending = sortedDimensions(stageKey, student);
    const needs = ascending.slice(0, 2);
    const strengths = ascending.slice(-2).reverse();
    const insights = $("#profile-insight-list");
    insights.innerHTML = "";
    const insightRows = [
      {
        icon: strengths[0].id,
        tone: "teal",
        title: `相对优势：${strengths[0].zh} + ${strengths[1].zh}`,
        body: `${strengths[0].zh} ${num(strengths[0].score, 1)} 分、${strengths[1].zh} ${num(strengths[1].score, 1)} 分，是本阶段六维中相对较高的两项。`,
      },
      {
        icon: needs[0].id,
        tone: "amber",
        title: `优先发展：${needs[0].zh}`,
        body: `当前 ${num(needs[0].score, 1)} 分，与本人最高维度相差 ${num(strengths[0].score - needs[0].score, 1)} 分。建议优先通过低风险任务验证兴趣与学习需求。`,
      },
      {
        icon: "T3",
        title: stageKey === "T3" ? `支持需求：${student.supportNeed}` : "未来阶段保持遮蔽",
        body:
          stageKey === "T3"
            ? `该支持需求由独立模拟支持测评规则生成；学习建议仍需教师结合课堂证据审核。`
            : `当前仅展示 ${stageKey} 已发生的数据，预测面板只在 T2 之后开放，避免未来信息泄漏。`,
      },
    ];
    insightRows.forEach((item) => {
      insights.append(
        el(
          "div",
          { class: "insight-row" },
          el("span", { class: `insight-icon ${item.tone || ""}` }, item.icon),
          el("div", {}, el("strong", {}, item.title), el("p", {}, item.body)),
        ),
      );
    });

    const stageOrder = ["T1", "T2", "T3"];
    const selectedIndex = stageOrder.indexOf(stageKey);
    const trend = stageOrder.map((key, index) => ({
      label: STAGE_LABELS[key],
      shortLabel: key,
      value: index <= selectedIndex ? student.stages[key].overall : null,
    }));
    lineChart($("#profile-trend"), trend, {
      width: 660,
      height: 280,
      minY: 40,
      maxY: 100,
      label: `${student.id} 综合能力变化`,
    });
    $("#profile-trend-note").textContent = `${stageKey} 之前可见`;

    const clusterDetail = $("#profile-cluster-detail");
    clusterDetail.innerHTML = "";
    if (!clusterAvailable) {
      $("#profile-cluster-badge").textContent = "T3 后形成";
      clusterDetail.append(
        el(
          "div",
          { class: "empty-state" },
          `当前仅展示 ${stageKey} 已到达数据。T3 K-means 群体结果不在 T1/T2 阶段调用或展示。`,
        ),
      );
    } else {
      $("#profile-cluster-badge").textContent = student.clusterName;
      const cluster = DATA.clustering.clusters[student.clusterId];
      clusterDetail.append(
        el(
          "p",
          { class: "section-note", style: { marginBottom: "12px" } },
          `该群体共 ${cluster.size} 人，占 ${pct(cluster.share)}。K=3 是教育应用折中方案，不是全局最优；群体名称不是固定学生标签。`,
        ),
      );
      const centerList = el("div", { class: "cluster-center-chart" });
      DIMS.forEach((dim) => {
        const score = cluster.center[dim.id];
        centerList.append(
          el(
            "div",
            { class: "cluster-feature-row" },
            el("span", {}, dim.zh),
            el("span", { class: "mini-score-bar" }, el("i", { style: { width: `${score}%` } })),
            el("strong", {}, num(score, 0)),
          ),
        );
      });
      clusterDetail.append(centerList);
    }

    const matrix = $("#indicator-matrix");
    matrix.innerHTML = "";
    DIMS.forEach((dim) => {
      const holder = el("div", { class: "indicator-dimension" });
      holder.append(
        el(
          "div",
          { class: "indicator-dimension-head" },
          el("span", { style: { background: dim.color } }, dim.id),
          el("strong", {}, dim.zh),
        ),
      );
      dim.indicators.forEach((indicator) => {
        const score = stage.indicators[indicator.id];
        holder.append(
          el(
            "div",
            { class: "indicator-item" },
            el(
              "div",
              { class: "indicator-label" },
              el("span", { title: indicator.en }, indicator.zh),
              el("strong", {}, num(score, 1)),
            ),
            el(
              "span",
              { class: "mini-score-bar" },
              el("i", { style: { width: `${score}%`, background: dim.color } }),
            ),
          ),
        );
      });
      matrix.append(holder);
    });

    const develop = $("#profile-develop-panel");
    develop.innerHTML = "";
    develop.append(
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "DEVELOPMENT FOCUS"),
          el("h2", {}, "相对优势与发展重点"),
        ),
      ),
    );
    if (stage.imputationCount > 0) {
      develop.append(
        el("div", { class: "indicator-note" }, `${icon("info")} 本阶段有 ${stage.imputationCount} 项字段经过插补，结果已保留审计记录。`),
      );
    }
    develop.append(
      el(
        "div",
        {},
        el("p", { class: "micro-copy", style: { marginBottom: "7px" } }, "相对优势"),
        ...strengths.map((dim) => el("span", { class: "development-chip strength" }, `${dim.id} · ${dim.zh} ${num(dim.score, 1)}`)),
        el("p", { class: "micro-copy", style: { marginBottom: "7px", marginTop: "10px" } }, "优先发展"),
        ...needs.map((dim) => el("span", { class: "development-chip" }, `${dim.id} · ${dim.zh} ${num(dim.score, 1)}`)),
      ),
      el(
        "p",
        { class: "micro-copy" },
        "“优先发展”仅表示当前六维内部相对较低，不表示低潜力或固定标签。后续建议需经教师审核并由学生反馈调整。",
      ),
      el(
        "button",
        {
          class: "button primary small",
          style: { marginTop: "13px" },
          onclick: () => {
            location.hash = "learning";
          },
        },
        "查看个性化学习计划",
      ),
    );
    renderProfilePrediction(student, stageKey);
  }

  function renderProfilePrediction(student, stageKey) {
    const panel = $("#profile-prediction-panel");
    panel.innerHTML = "";
    panel.append(
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "MODEL ESTIMATE"),
          el("h2", {}, "支持需求与下一阶段预测"),
        ),
        el("span", { class: "soft-tag" }, "预计算"),
      ),
    );
    if (stageKey === "T1") {
      panel.append(
        el(
          "div",
          { class: "empty-state" },
          "T1 仅已知初始测评。为避免使用未来数据，预测面板将在 T2 阶段开放。",
        ),
      );
      return;
    }
    const metrics = DATA.regression.metrics;
    if (stageKey === "T2") {
      const evidenceRole =
        student.evaluationSplit === "test"
          ? "该学生属于 40 名留出测试集，模型输出可作为独立测试样例。"
          : "该学生属于 160 名训练集，此输出属于训练后推断，不是独立泛化证据。";
      panel.append(
        el(
          "div",
          { class: "prediction-metric-grid" },
          predictionMetric("T3 支持需求估计", student.classPrediction, "决策树仅读取 T1/T2 特征"),
          predictionMetric("T3 综合能力预测", num(student.forecastT3, 1), `测试集 MAE ${num(metrics.mae, 2)}`),
        ),
        el(
          "p",
          { class: "micro-copy" },
          `模型输入只包含 T1/T2 能力和 T2 学习行为。${evidenceRole} 预测反映合成数据中的统计关系，不表示确定发展结果。`,
        ),
      );
      return;
    }
    panel.append(
      el(
        "div",
        { class: "prediction-metric-grid" },
        predictionMetric("T3 实际规则标签", student.supportNeed, "用于研究回看，不作为训练输入"),
        predictionMetric(
          "模型曾预测",
          student.classPrediction,
          student.classPrediction === student.supportNeed ? "本次分类一致" : "本次分类不一致",
        ),
        predictionMetric("T3 实际综合分", num(student.stages.T3.overall, 1), "已到达阶段"),
        predictionMetric("模型预测综合分", num(student.forecastT3, 1), `研究回看残差 ${num(student.forecastResidualT3, 1)}`),
      ),
      el(
        "p",
        { class: "micro-copy" },
        `T3 实际值只用于事后评价，不参与 T1/T2 输入特征。${
          student.evaluationSplit === "test"
            ? "该生属于留出测试集，可对照独立测试结果。"
            : "该生属于训练集，此处预测不能作为独立泛化证据。"
        }`,
      ),
    );
  }

  function predictionMetric(label, value, note) {
    return el(
      "div",
      { class: "prediction-metric" },
      el("span", {}, label),
      el("strong", { style: { fontSize: String(value).length > 8 ? "13px" : "17px" } }, value),
      el("small", {}, note),
    );
  }

  function labHeader(config) {
    return el(
      "div",
      { class: "lab-intro" },
      el(
        "section",
        { class: "card" },
        el(
          "div",
          { class: "section-heading compact" },
          el(
            "div",
            {},
            el("p", { class: "eyebrow dark" }, config.eyebrow),
            el("h2", {}, config.title),
          ),
          el("span", { class: "soft-tag" }, "实际运行"),
        ),
        el("p", { class: "section-note" }, config.purpose),
        el("div", { class: "process-flow" }, config.process.map((step) => el("span", {}, step))),
      ),
      el(
        "section",
        { class: "card" },
        el(
          "div",
          { class: "lab-meta-grid" },
          ...config.meta.map(([label, value]) =>
            el(
              "div",
              { class: "lab-meta-item" },
              el("span", {}, label),
              el("strong", {}, value),
            ),
          ),
        ),
      ),
    );
  }

  function metricCard(label, value, note, best = false) {
    return el(
      "div",
      { class: `metric-card ${best ? "best" : ""}` },
      el("span", {}, label),
      el("strong", {}, value),
      el("small", {}, note),
    );
  }

  function limitationBox(items) {
    return el(
      "div",
      { class: "limitations-box" },
      el("h3", {}, "算法局限与研究边界"),
      el("ul", {}, ...items.map((item) => el("li", {}, item))),
    );
  }

  function evidenceLayerCard(rows) {
    return el(
      "section",
      { class: "card evidence-layer-card" },
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "EVIDENCE LAYERS"),
          el("h2", {}, "训练、交叉验证与测试证据分层"),
        ),
      ),
      el(
        "div",
        { class: "evidence-layer-grid" },
        ...rows.map((row) =>
          el(
            "div",
            { class: `evidence-layer-item ${row.tone || ""}` },
            el("span", {}, row.label),
            el("strong", {}, row.value),
            el("small", {}, row.note),
          ),
        ),
      ),
      el(
        "p",
        { class: "micro-copy" },
        "训练集拟合值只说明模型对已见样本的拟合程度；交叉验证折外预测用于稳定性检查；留出测试集才作为页面报告的主要泛化证据。",
      ),
    );
  }

  function renderLabPage() {
    renderTreeLab();
    renderRegressionLab();
    renderClusteringLab();
    renderAssociationLab();
    $$(".algorithm-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.algorithm === state.algorithm);
      tab.onclick = () => {
        state.algorithm = tab.dataset.algorithm;
        $$(".algorithm-tab").forEach((item) =>
          item.classList.toggle("active", item.dataset.algorithm === state.algorithm),
        );
        $$(".algorithm-panel").forEach((item) =>
          item.classList.toggle("active", item.dataset.panel === state.algorithm),
        );
      };
    });
    $$(".algorithm-panel").forEach((item) =>
      item.classList.toggle("active", item.dataset.panel === state.algorithm),
    );
  }

  function renderTreeLab() {
    const root = $("#lab-tree");
    const model = DATA.classification;
    const metrics = model.metrics;
    const nested = model.nestedCvMetrics;
    const training = model.trainingFitMetrics;
    root.innerHTML = "";
    root.append(
      labHeader({
        eyebrow: "01 · DECISION TREE CLASSIFICATION",
        title: "决策树分类",
        purpose: model.purpose,
        process: ["T1/T2 特征", "学生级 80/20 划分", "训练折内插补", "嵌套 5×5 交叉验证", "留出测试集评估"],
        meta: [
          ["训练 / 测试", `${model.split.trainStudents} / ${model.split.testStudents} 名学生`],
          ["最佳参数", `max_depth=${model.bestParams.max_depth}`],
          ["最小叶样本", model.bestParams.min_samples_leaf],
          ["目标标签", "T3 支持需求（独立模拟测评）"],
          ["交叉验证", "外层 5 折 × 内层 5 折"],
          ["输入泄漏检查", "未使用 T3 能力或 T3 行为"],
        ],
      }),
      el(
        "div",
        { class: "metric-grid" },
        metricCard("训练集拟合 Accuracy", num(training.accuracy, 3), "表观诊断，不是泛化证据"),
        metricCard("嵌套交叉验证 Accuracy", num(nested.accuracy, 3), "训练集内折外预测"),
        metricCard("留出测试 Accuracy", num(metrics.accuracy, 3), `基线 ${num(metrics.baselineAccuracy, 3)}`, true),
        metricCard(
          "优先支持 Recall",
          num(model.perClass["优先学习支持"].recall, 3),
          `F1 ${num(model.perClass["优先学习支持"].f1, 3)} · 易漏判`,
        ),
      ),
    );
    root.append(
      evidenceLayerCard([
        {
          label: "训练集拟合",
          value: `Accuracy ${num(training.accuracy, 3)}`,
          note: "160 名训练学生；只用于过拟合诊断",
          tone: "diagnostic",
        },
        {
          label: "嵌套交叉验证",
          value: `Accuracy ${num(nested.accuracy, 3)}`,
          note: "外层 5 折 × 内层 5 折；折外预测",
          tone: "cv",
        },
        {
          label: "留出测试集",
          value: `Accuracy ${num(metrics.accuracy, 3)}`,
          note: "40 名独立测试学生；主要泛化证据",
          tone: "test",
        },
      ]),
    );
    const treeCard = el(
      "section",
      { class: "card" },
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "TREE STRUCTURE"),
          el("h2", {}, "决策树结构图"),
        ),
        el("span", { class: "soft-tag" }, `CV macro-F1 ${num(model.bestCvF1Macro, 3)}`),
      ),
      el("p", { class: "micro-copy", style: { marginBottom: "10px" } }, "每个节点显示分裂特征、阈值和训练样本数；叶子节点为预测类别。"),
    );
    const treeHost = el("div", { class: "tree-scroll" });
    treeCard.append(treeHost);
    root.append(treeCard);
    treeDiagram(treeHost, model.tree);

    const cmCard = el(
      "section",
      { class: "card" },
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "CONFUSION MATRIX"),
          el("h2", {}, "分类混淆矩阵"),
        ),
      ),
    );
    const heatHost = el("div");
    cmCard.append(heatHost);
    const shortLabels = ["常规支持", "针对性支持", "优先支持"];
    heatmapMatrix(heatHost, shortLabels, model.confusionMatrix);
    const featuresCard = el(
      "section",
      { class: "card" },
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "FEATURE IMPORTANCE"),
          el("h2", {}, "特征重要性"),
        ),
      ),
    );
    const featureHost = el("div");
    featuresCard.append(featureHost);
    horizontalBars(
      featureHost,
      model.featureImportance.slice(0, 10).map((feature) => ({
        label: feature.label,
        value: feature.importance * 100,
        color: "#1570ef",
        display: num(feature.importance, 3),
        tooltip: `归一化重要性：${num(feature.importance, 4)}`,
      })),
      {
        width: 620,
        left: 175,
        height: 335,
        max: Math.max(...model.featureImportance.map((item) => item.importance * 100), 1),
        label: "决策树特征重要性",
      },
    );
    root.append(el("div", { class: "lab-grid" }, cmCard, featuresCard));

    const detailsCard = el(
      "section",
      { class: "card" },
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "CLASS BREAKDOWN"),
          el("h2", {}, "各类别指标与误判样本"),
        ),
        el("span", { class: "soft-tag" }, `全部样本 ${Object.values(model.classCounts).reduce((a, b) => a + b, 0)}`),
      ),
    );
    const classTable = el("div", { class: "table-wrap" });
    classTable.innerHTML = `
      <table class="data-table">
        <thead><tr><th>类别</th><th>总体样本</th><th>测试集</th><th>Precision</th><th>Recall</th><th>F1</th></tr></thead>
        <tbody>${model.classes
          .map(
            (label) => `<tr style="${label === "优先学习支持" ? "background:#fff5f6" : ""}"><td>${label}</td><td>${model.classCounts[label]}</td><td>${model.perClass[label].support}</td><td>${num(model.perClass[label].precision, 3)}</td><td>${num(model.perClass[label].recall, 3)}</td><td>${num(model.perClass[label].f1, 3)}</td></tr>`,
          )
          .join("")}</tbody>
      </table>`;
    detailsCard.append(classTable);
    detailsCard.append(
      el(
        "div",
        { class: "academic-alert danger" },
        el("strong", {}, "优先学习支持类别存在明显漏判风险"),
        el(
          "p",
          {},
          `测试集 Recall 为 ${num(model.perClass["优先学习支持"].recall, 3)}、F1 为 ${num(model.perClass["优先学习支持"].f1, 3)}，而该类别测试样本仅 ${model.perClass["优先学习支持"].support} 人。模型不应独立用于识别或排除需要优先支持的学生，应由教师结合课堂证据复核。`,
        ),
      ),
    );
    if (model.misclassified.length) {
      detailsCard.append(
        el("p", { class: "micro-copy", style: { marginTop: "14px" } }, "测试集误判样例（最多展示 8 条）"),
      );
      const mis = el("div", { class: "table-wrap" });
      mis.innerHTML = `<table class="data-table"><thead><tr><th>学生</th><th>年级</th><th>实际标签</th><th>预测标签</th><th>实际类别预测概率</th></tr></thead><tbody>${model.misclassified
        .map(
          (item) =>
            `<tr><td>${item.studentId}</td><td>${item.grade}</td><td>${item.actual}</td><td>${item.predicted}</td><td>${num(item.actualClassProbability, 3)}</td></tr>`,
        )
        .join("")}</tbody></table>`;
      detailsCard.append(mis);
    }
    root.append(detailsCard, limitationBox(model.limitations));
  }

  function renderRegressionLab() {
    const root = $("#lab-regression");
    const model = DATA.regression;
    const metrics = model.metrics;
    const training = model.trainingFitMetrics;
    const cv = model.crossValidationMetrics;
    root.innerHTML = "";
    root.append(
      labHeader({
        eyebrow: "02 · LINEAR REGRESSION",
        title: "线性回归",
        purpose: model.purpose,
        process: ["T1/T2 特征", "训练折内插补", "训练折内标准化", "学生级划分", "留出测试与折外诊断"],
        meta: [
          ["目标变量", "T3 综合能力"],
          ["输入变量", `${model.features.length} 项`],
          ["训练学生", "160 名"],
          ["测试学生", "40 名"],
          ["输入泄漏检查", "排除所有 T3 能力与 T3 行为"],
          ["固定随机种子", "42"],
        ],
      }),
      el(
        "div",
        { class: "metric-grid" },
        metricCard("训练集拟合 R²", num(training.r2, 3), "表观诊断，不是泛化证据"),
        metricCard("训练集内 5 折 CV R²", num(cv.r2, 3), "每折重新插补与标准化"),
        metricCard("留出测试 R²", num(metrics.r2, 3), `持续性基线 ${num(metrics.baselinePersistenceR2, 3)}`, true),
        metricCard("留出测试 MAE", num(metrics.mae, 3), `均值基线 ${num(metrics.baselineMeanMae, 3)}`),
      ),
    );
    root.append(
      evidenceLayerCard([
        {
          label: "训练集拟合",
          value: `R² ${num(training.r2, 3)}`,
          note: "160 名训练学生；仅用于过拟合诊断",
          tone: "diagnostic",
        },
        {
          label: "训练集内交叉验证",
          value: `R² ${num(cv.r2, 3)}`,
          note: "5 折折外预测；测试集未参与",
          tone: "cv",
        },
        {
          label: "留出测试集",
          value: `R² ${num(metrics.r2, 3)}`,
          note: `MAE ${num(metrics.mae, 3)} / RMSE ${num(metrics.rmse, 3)}`,
          tone: "test",
        },
      ]),
    );
    const scatterCard = el(
      "section",
      { class: "card" },
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "ACTUAL VS PREDICTED"),
          el("h2", {}, "留出测试集：实际值与预测值"),
        ),
        el("span", { class: "soft-tag" }, "测试集 n=40"),
      ),
    );
    const scatterHost = el("div");
    scatterCard.append(scatterHost);
    scatterChart(
      scatterHost,
      model.scatter.map((point) => ({
        x: point.actual,
        y: point.predicted,
        tooltip: `<strong>${point.studentId}</strong><br>实际 ${num(point.actual, 2)}<br>预测 ${num(point.predicted, 2)}<br>残差 ${num(point.residual, 2)}`,
      })),
      {
        width: 700,
        height: 345,
        diagonal: true,
        xLabel: "T3 实际综合能力",
        yLabel: "预测综合能力",
        label: "回归实际值与预测值",
      },
    );
    const residualCard = el(
      "section",
      { class: "card" },
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "RESIDUAL ANALYSIS"),
          el("h2", {}, "留出测试集残差分布"),
        ),
      ),
    );
    const residualHost = el("div");
    residualCard.append(residualHost);
    scatterChart(
      residualHost,
      model.scatter.map((point) => ({
        x: point.predicted,
        y: point.residual,
        color: point.residual >= 0 ? "#0ea5a4" : "#e85d75",
        radius: 4.4,
        tooltip: `<strong>${point.studentId}</strong><br>预测 ${num(point.predicted, 2)}<br>残差 ${num(point.residual, 2)}`,
      })),
      {
        width: 700,
        height: 345,
        zeroY: true,
        xLabel: "预测值",
        yLabel: "残差（实际 - 预测）",
        label: "回归残差分析",
      },
    );
    root.append(el("div", { class: "lab-grid" }, scatterCard, residualCard));

    const coeffCard = el(
      "section",
      { class: "card" },
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "STANDARDIZED COEFFICIENTS"),
          el("h2", {}, "回归系数"),
        ),
        el("span", { class: "soft-tag" }, `截距 ${num(model.intercept, 2)}`),
      ),
    );
    const coeffHost = el("div");
    coeffCard.append(coeffHost);
    const maxCoeff = Math.max(...model.coefficients.map((item) => Math.abs(item.standardizedCoefficient)));
    horizontalBars(
      coeffHost,
      model.coefficients.slice(0, 10).map((item) => ({
        label: item.label,
        value: Math.abs(item.standardizedCoefficient),
        color: item.standardizedCoefficient >= 0 ? "#0ea5a4" : "#e85d75",
        display: `${item.standardizedCoefficient >= 0 ? "+" : ""}${num(item.standardizedCoefficient, 2)}`,
        tooltip: `标准化系数 ${num(item.standardizedCoefficient, 3)}`,
      })),
      {
        width: 610,
        left: 180,
        height: 350,
        max: maxCoeff,
        label: "线性回归标准化系数",
      },
    );
    const foldCard = el(
      "section",
      { class: "card" },
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "CROSS VALIDATION"),
          el("h2", {}, "5 折诊断与基线"),
        ),
      ),
      el(
        "div",
        { class: "table-wrap" },
        el(
          "table",
          { class: "data-table" },
          el(
            "thead",
            {},
            el("tr", {}, el("th", {}, "折"), el("th", {}, "MAE"), el("th", {}, "RMSE"), el("th", {}, "R²")),
          ),
          el(
            "tbody",
            {},
            ...model.folds.map((fold) =>
              el(
                "tr",
                {},
                el("td", {}, fold.fold),
                el("td", {}, num(fold.mae, 3)),
                el("td", {}, num(fold.rmse, 3)),
                el("td", {}, num(fold.r2, 3)),
              ),
            ),
          ),
        ),
      ),
      el(
        "div",
        { class: "prediction-metric-grid" },
        predictionMetric("简单均值基线 MAE", num(metrics.baselineMeanMae, 3), "训练集目标均值"),
        predictionMetric("持续性基线 MAE", num(metrics.baselinePersistenceMae, 3), "直接使用 T2 综合分"),
      ),
    );
    root.append(el("div", { class: "lab-grid" }, coeffCard, foldCard), limitationBox(model.limitations));
  }

  function renderClusteringLab() {
    const root = $("#lab-clustering");
    const model = DATA.clustering;
    const selected = model.evaluations.find((item) => item.k === state.labK) || model.evaluations[0];
    root.innerHTML = "";
    root.append(
      labHeader({
        eyebrow: "03 · K-MEANS CLUSTERING",
        title: "K-means 聚类",
        purpose: model.purpose,
        process: ["T3 六维得分", "标准化", "K=2–6 比较", "轮廓系数", "PCA 二维可视化"],
        meta: [
          ["应用方案 K", model.chosenK],
          ["轮廓系数", num(model.chosenSilhouette, 3)],
          ["输入维度", "S/T/E/M/I/C"],
          ["学生数", "200"],
          ["启动次数", "n_init=30"],
          ["固定随机种子", "42"],
        ],
      }),
      el(
        "div",
        { class: "metric-grid" },
        metricCard("教育应用方案", `K = ${model.chosenK}`, "应用折中，不是全局最优"),
        metricCard("K=2 轮廓系数", num(model.k2VsK3.k2.silhouette, 3), "统计分离度更高", true),
        metricCard("K=3 轮廓系数", num(model.k2VsK3.k3.silhouette, 3), "较 K=2 低，边界更模糊"),
        metricCard("最小群体", `${Math.min(...model.clusters.map((item) => item.size))} 人`, `占比 ${pct(Math.min(...model.clusters.map((item) => item.share)))}`),
      ),
    );

    const comparisonCard = el(
      "section",
      { class: "card" },
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "MODEL SELECTION"),
          el("h2", {}, "K 值比较"),
        ),
        el("span", { class: "precomputed-label" }, "K=2–6 均已实际运行"),
      ),
      el(
        "div",
        { class: "parameter-box", style: { marginBottom: "12px" } },
        el(
          "div",
          { class: "parameter-row" },
          el("span", {}, "查看已验证 K"),
          el(
            "input",
            {
              type: "range",
              min: 2,
              max: 6,
              step: 1,
              value: state.labK,
              oninput: (event) => {
                state.labK = Number(event.target.value);
                renderClusteringLab();
              },
            },
          ),
          el("strong", {}, state.labK),
        ),
      ),
      el(
        "div",
        { class: "table-wrap" },
        el(
          "table",
          { class: "data-table" },
          el(
            "thead",
            {},
            el("tr", {}, el("th", {}, "K"), el("th", {}, "Inertia"), el("th", {}, "Silhouette"), el("th", {}, "最小群体占比"), el("th", {}, "选择")),
          ),
          el(
            "tbody",
            {},
            ...model.evaluations.map((item) =>
              el(
                "tr",
                {},
                el("td", {}, item.k),
                el("td", {}, num(item.inertia, 1)),
                el("td", {}, num(item.silhouette, 3)),
                el("td", {}, pct(item.minClusterShare)),
                el(
                  "td",
                  {},
                  item.k === state.labK
                    ? `${item.k === model.chosenK ? "教育应用方案" : "当前查看"}`
                    : item.k === model.k2VsK3.higherSilhouetteK
                      ? "轮廓系数更高"
                      : "",
                ),
              ),
            ),
          ),
        ),
      ),
      el(
        "div",
        { class: "academic-alert warning" },
        el("strong", {}, "K=3 的教育应用价值与统计代价"),
        el(
          "p",
          {},
          `K=2 轮廓系数 ${num(model.k2VsK3.k2.silhouette, 3)}，高于 K=3 的 ${num(model.k2VsK3.k3.silhouette, 3)}。K=3 将 ${model.k2VsK3.k2.clusterSizes.join(" / ")} 人的两类结构细化为 ${model.k2VsK3.k3.clusterSizes.join(" / ")} 人的三类结构，提升了教师分层观察的丰富度，但产生了 ${Math.abs(model.k2VsK3.silhouetteDifferenceK3MinusK2).toFixed(4)} 的轮廓系数下降。K=3 是教育应用折中方案，不是全局最优。`,
        ),
        el("p", {}, model.k2VsK3.educationalApplicationValue),
        el("p", {}, model.k2VsK3.statisticalCost),
      ),
      el(
        "p",
        { class: "micro-copy" },
        `当前查看 K=${selected.k} 的真实轮廓系数 ${num(selected.silhouette, 3)}。最终适用 K=${model.chosenK}；选择规则：${model.selectionRule}`,
      ),
    );
    const scatterCard = el(
      "section",
      { class: "card" },
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "PCA PROJECTION"),
          el("h2", {}, "聚类散点图"),
        ),
        el("span", { class: "soft-tag" }, `K=${model.chosenK} 教育应用方案`),
      ),
    );
    const scatterHost = el("div");
    scatterCard.append(scatterHost);
    const colors = ["#1570ef", "#0ea5a4", "#7c5cfc", "#f59e0b", "#e85d75", "#64748b"];
    scatterChart(
      scatterHost,
      model.points.map((point) => {
        const cluster = model.clusters[point.clusterId];
        return {
          x: point.x,
          y: point.y,
          color: colors[point.clusterId % colors.length],
          tooltip: `<strong>${point.studentId}</strong><br>${cluster.name}<br>PC1 ${num(point.x, 2)} / PC2 ${num(point.y, 2)}`,
        };
      }),
      {
        width: 720,
        height: 390,
        radius: 4,
        opacity: 0.68,
        xLabel: `PC1 · 解释方差 ${pct(model.explainedVariance[0])}`,
        yLabel: `PC2 · 解释方差 ${pct(model.explainedVariance[1])}`,
        label: "K-means PCA 散点图",
      },
    );
    root.append(el("div", { class: "lab-grid" }, comparisonCard, scatterCard));

    const profileCard = el(
      "section",
      { class: "card" },
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "CLUSTER INTERPRETATION"),
          el("h2", {}, "群体中心与规模"),
        ),
        el(
          "select",
          {
            "aria-label": "查看群体",
            onchange: (event) => {
              state.clusterView = Number(event.target.value);
              renderClusteringLab();
            },
          },
          ...model.clusters.map((cluster) =>
            el("option", { value: cluster.id, selected: cluster.id === state.clusterView }, cluster.name),
          ),
        ),
      ),
    );
    const cluster = model.clusters[state.clusterView] || model.clusters[0];
    profileCard.append(
      el(
        "div",
        { class: "cluster-distribution" },
        ...model.clusters.map((item) => {
          const active = item.id === cluster.id;
          return el(
            "div",
            {
              class: "cluster-dist-item",
              style: active ? { outline: "1px solid #a8c9f2", background: "#f5f9ff" } : {},
            },
            el(
              "div",
              { class: "cluster-dist-head" },
              el("span", {}, item.name),
              el("strong", {}, `${item.size} 人 · ${pct(item.share)}`),
            ),
            el(
              "span",
              { class: "mini-score-bar", style: { width: "100%" } },
              el("i", { style: { width: `${item.share * 100}%` } }),
            ),
          );
        }),
      ),
      el("p", { class: "micro-copy", style: { marginTop: "12px" } }, `${cluster.name} 的中心特征：最高维度 ${DIM_MAP[cluster.highest].zh} ${num(cluster.center[cluster.highest], 1)}，次高维度 ${DIM_MAP[cluster.second].zh} ${num(cluster.center[cluster.second], 1)}。`),
    );
    const radarCard = el(
      "section",
      { class: "card" },
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "CENTROID RADAR"),
          el("h2", {}, cluster.name),
        ),
        el("span", { class: "soft-tag" }, `${cluster.size} 人`),
      ),
    );
    const radarHost = el("div", { class: "chart-box radar-box" });
    radarCard.append(radarHost);
    radarChart(
      radarHost,
      DIMS.map((dim) => cluster.center[dim.id]),
      DIMENSIONS_AVERAGE("T3"),
      { width: 500, height: 385, color: "#7c5cfc", label: "聚类中心雷达图" },
    );
    root.append(
      el("div", { class: "lab-grid" }, profileCard, radarCard),
      limitationBox(model.limitations),
    );
  }

  function DIMENSIONS_AVERAGE(stage) {
    const means = groupMean(stage);
    return DIMS.map((dim) => means[dim.id]);
  }

  function renderAssociationLab() {
    const root = $("#lab-association");
    const model = DATA.association;
    root.innerHTML = "";
    root.append(
      labHeader({
        eyebrow: "04 · APRIORI ASSOCIATION RULES",
        title: "Apriori 关联规则",
        purpose: model.purpose,
        process: ["连续变量离散化", "二值事务矩阵", "频繁项集", "关联规则", "参数阈值筛选"],
        meta: [
          ["事务数", model.transactionCount],
          ["二元项", model.binaryItems.length],
          ["频繁项集", model.frequentItemsetCount],
          ["初始规则数", model.primaryRuleCount],
          ["探索规则池", model.explorationRuleCount],
          ["最大项集长度", "3"],
        ],
      }),
      el(
        "div",
        { class: "metric-grid" },
        metricCard("Support", num(state.assocSupport, 2), "当前查询阈值"),
        metricCard("Confidence", num(state.assocConfidence, 2), "当前查询阈值"),
        metricCard("Lift", num(state.assocLift, 2), "当前查询阈值"),
        metricCard("符合规则", filteredAssociationRules().length, `已运行规则池 ${model.explorationRuleCount}`),
      ),
    );

    const controlsCard = el(
      "section",
      { class: "card" },
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "PRECOMPUTED QUERY"),
          el("h2", {}, "参数阈值筛选"),
        ),
        el("span", { class: "precomputed-label" }, "查询真实规则池"),
      ),
      el(
        "div",
        { class: "parameter-box" },
        parameterRange("最小支持度", "support", state.assocSupport, 0.08, 0.5, 0.01),
        parameterRange("最小置信度", "confidence", state.assocConfidence, 0.5, 1, 0.01),
        parameterRange("最小提升度", "lift", state.assocLift, 1, 2, 0.01),
      ),
      el(
        "p",
        { class: "micro-copy" },
        `Python 已使用最小阈值 0.08 / 0.50 / 1.00 实际运行 Apriori，共得到 ${model.explorationRuleCount} 条规则。拖动滑块仅筛选已运行结果，不会在浏览器中重新训练。`,
      ),
      el(
        "div",
        { class: "formula-strip" },
        el("span", {}, "初始方案：Support ≥ 0.15"),
        el("span", {}, "Confidence ≥ 0.60"),
        el("span", {}, "Lift ≥ 1.10"),
      ),
    );
    const scatterCard = el(
      "section",
      { class: "card" },
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "RULE STRENGTH"),
          el("h2", {}, "支持度 × 置信度 × 提升度"),
        ),
      ),
    );
    const scatterHost = el("div");
    scatterCard.append(scatterHost);
    const rules = filteredAssociationRules().slice(0, 50);
    if (rules.length) {
      const maxLift = Math.max(...rules.map((rule) => rule.lift), 1.2);
      scatterChart(
        scatterHost,
        rules.map((rule) => {
          const t = clamp((rule.lift - 1) / (maxLift - 1), 0, 1);
          return {
            x: rule.support,
            y: rule.confidence,
            color: `hsl(${180 - 135 * t}, 70%, ${42 - 8 * t}%)`,
            radius: 4 + t * 3,
            tooltip: `<strong>${rule.id}</strong><br>${rule.antecedentText}<br>→ ${rule.consequentText}<br>Support ${num(rule.support, 3)} · Confidence ${num(rule.confidence, 3)}<br>Lift ${num(rule.lift, 3)}`,
          };
        }),
        {
          width: 660,
          height: 360,
          xMin: 0.05,
          xMax: 1,
          yMin: 0.45,
          yMax: 1,
          xLabel: "Support",
          yLabel: "Confidence",
          label: "关联规则散点图",
        },
      );
    } else {
      scatterHost.append(el("div", { class: "empty-state" }, "当前阈值下没有符合条件的已运行规则。"));
    }
    root.append(el("div", { class: "lab-grid" }, controlsCard, scatterCard));

    const tableCard = el(
      "section",
      { class: "card" },
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "ASSOCIATION RULES"),
          el("h2", {}, "关联规则表"),
        ),
        el("span", { class: "soft-tag" }, `显示前 ${Math.min(rules.length, 30)} 条`),
      ),
    );
    if (rules.length) {
      const ruleTable = el("div", { class: "rule-table-wrap" });
      ruleTable.innerHTML = `<table class="data-table"><thead><tr><th>规则</th><th>前件</th><th>后件</th><th>Support</th><th>Confidence</th><th>Lift</th></tr></thead><tbody>${rules
        .slice(0, 30)
        .map(
          (rule) =>
            `<tr><td>${rule.id}</td><td>${rule.antecedentText}</td><td>${rule.consequentText}</td><td>${num(rule.support, 3)}</td><td>${num(rule.confidence, 3)}</td><td>${num(rule.lift, 3)}</td></tr>`,
        )
        .join("")}</tbody></table>`;
      tableCard.append(ruleTable);
    } else {
      tableCard.append(el("div", { class: "empty-state" }, "当前阈值下没有符合要求的规则。平台会如实显示，不虚构结果。"));
    }
    const representativeCard = el(
      "section",
      { class: "card representative-rule-card" },
      el(
        "div",
        { class: "section-heading compact" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow dark" }, "REPRESENTATIVE RULES"),
          el("h2", {}, "非冗余教育代表性规则"),
        ),
        el("span", { class: "soft-tag" }, `${model.representativeRules.length} 条`),
      ),
      el(
        "p",
        { class: "section-note" },
        model.representativeSelection,
      ),
      el(
        "div",
        { class: "representative-rule-grid" },
        ...model.representativeRules.map((rule) =>
          el(
            "article",
            { class: "representative-rule-item" },
            el(
              "div",
              { class: "representative-rule-head" },
              el("strong", {}, rule.id),
              el("span", {}, rule.consequentText),
            ),
            el("p", { class: "rule-statement" }, `${rule.antecedentText} → ${rule.consequentText}`),
            el(
              "div",
              { class: "rule-metric-row" },
              el("span", {}, `Support ${num(rule.support, 3)}`),
              el("span", {}, `Confidence ${num(rule.confidence, 3)}`),
              el("span", {}, `Lift ${num(rule.lift, 3)}`),
            ),
            el("p", { class: "rule-education-note" }, rule.educationalInterpretation),
          ),
        ),
      ),
      el(
        "p",
        { class: "micro-copy" },
        "以上仅为共同出现的模式，不代表行为导致能力提升；代表性筛选不等同于自动统计最优规则排序。",
      ),
    );
    root.append(
      tableCard,
      representativeCard,
      limitationBox(model.limitations),
    );
  }

  function parameterRange(label, key, value, min, max, step) {
    return el(
      "div",
      { class: "parameter-row" },
      el("span", {}, label),
      el("input", {
        type: "range",
        min,
        max,
        step,
        value,
        oninput: (event) => {
          state[`assoc${key[0].toUpperCase()}${key.slice(1)}`] = Number(event.target.value);
          renderAssociationLab();
        },
      }),
      el("strong", {}, num(value, 2)),
    );
  }

  function filteredAssociationRules() {
    return DATA.association.rules.filter(
      (rule) =>
        rule.support >= state.assocSupport &&
        rule.confidence >= state.assocConfidence &&
        rule.lift >= state.assocLift,
    );
  }

  const TASK_LIBRARY = {
    S: [
      {
        name: "校园微气候观测与证据分析",
        goal: "完成 3 个地点的温度与湿度采样，比较观测证据并提出一个有边界的解释。",
        time: "2 次 × 45 分钟",
        difficulty: "基础",
        evaluation: "观测记录表 + 证据链说明",
      },
      {
        name: "食品标签科学探究",
        goal: "提出可检验问题，设计公平比较并识别包装信息中的证据限制。",
        time: "90 分钟",
        difficulty: "进阶",
        evaluation: "探究方案 + 证据质量量表",
      },
      {
        name: "校园雨水径流小实验",
        goal: "设计对照条件，记录实验过程，并根据数据修正最初的解释。",
        time: "1 次项目课",
        difficulty: "挑战",
        evaluation: "实验报告 + 同伴证据评议",
      },
    ],
    T: [
      {
        name: "学习数据可视化仪表板",
        goal: "使用表格或可视化工具整理一组学习数据，并解释图表选择的理由。",
        time: "2 次 × 40 分钟",
        difficulty: "基础",
        evaluation: "可运行图表 + 操作说明",
      },
      {
        name: "数字工具无障碍测评",
        goal: "选择一项数字工具，从可读性、操作步骤和容错三个角度完成可用性测试。",
        time: "90 分钟",
        difficulty: "进阶",
        evaluation: "测试清单 + 改进建议",
      },
      {
        name: "校园信息检索任务",
        goal: "围绕一个真实问题比较多种信息来源，记录检索策略并核查信息可信度。",
        time: "1 周微任务",
        difficulty: "挑战",
        evaluation: "来源对比表 + 证据核查记录",
      },
    ],
    E: [
      {
        name: "桥梁承重结构设计",
        goal: "用限定材料设计并制作桥梁模型，记录设计、测试与一次优化迭代。",
        time: "2 次 × 50 分钟",
        difficulty: "进阶",
        evaluation: "原型 + 载荷测试 + 优化记录",
      },
      {
        name: "智能垃圾分类装置原型",
        goal: "识别用户需求，用纸板或低代码工具完成可演示的交互原型。",
        time: "2 次项目课",
        difficulty: "进阶",
        evaluation: "原型演示 + 用户反馈表",
      },
      {
        name: "校园节能装置小规模测试",
        goal: "明确约束条件，制作功能原型并比较至少两个版本的效果。",
        time: "1 周",
        difficulty: "挑战",
        evaluation: "版本对比 + 测试日志",
      },
    ],
    M: [
      {
        name: "校园能源消耗数学建模",
        goal: "建立班级用电量的简单模型，用数据估计趋势并说明模型误差。",
        time: "2 次 × 45 分钟",
        difficulty: "进阶",
        evaluation: "数学建模单 + 估算误差说明",
      },
      {
        name: "交通流量统计推理",
        goal: "完成定时定点计数，用图表描述规律并检验一个可证伪的猜想。",
        time: "90 分钟",
        difficulty: "基础",
        evaluation: "统计表 + 推理过程",
      },
      {
        name: "校园空间比例优化",
        goal: "使用比例与面积数据提出空间使用方案，并比较两种方案的取舍。",
        time: "1 次项目课",
        difficulty: "挑战",
        evaluation: "方案图 + 计算依据",
      },
    ],
    I: [
      {
        name: "校园环保装置多方案设计",
        goal: "围绕同一问题生成至少三种不同思路，并依据约束条件筛选方案。",
        time: "90 分钟",
        difficulty: "进阶",
        evaluation: "创意组合图 + 方案标准表",
      },
      {
        name: "低碳校园创意冲刺",
        goal: "在短周期内完成创意生成、同侪反馈和一次方案改进。",
        time: "2 次 × 35 分钟",
        difficulty: "基础",
        evaluation: "创意日志 + 改进前后对比",
      },
      {
        name: "反常识问题设计挑战",
        goal: "围绕 STEM 学习中的常见假设提出问题，并形成两个可验证的替代解释。",
        time: "1 周微任务",
        difficulty: "挑战",
        evaluation: "问题清单 + 可检验方案",
      },
    ],
    C: [
      {
        name: "跨学科项目协作复盘",
        goal: "完成一次明确分工的小组任务，并使用同伴反馈复盘沟通与贡献。",
        time: "2 次 × 40 分钟",
        difficulty: "基础",
        evaluation: "分工表 + 协作复盘卡",
      },
      {
        name: "社区 STEM 科普策展",
        goal: "与同伴共同设计一个科普展位，明确角色、时间节点与质量控制。",
        time: "1 周小组任务",
        difficulty: "进阶",
        evaluation: "展位成果 + 团队互评",
      },
      {
        name: "证据辩论与角色互换",
        goal: "在小组成员间交换立场，练习倾听、澄清和基于证据回应。",
        time: "1 次项目课",
        difficulty: "进阶",
        evaluation: "辩论记录 + 沟通反馈",
      },
    ],
  };

  function getFeedbackRecords() {
    return readLocal(STORAGE.feedback, []);
  }

  function getFeedback(studentId, taskId) {
    return (
      getFeedbackRecords().find(
        (record) => record.studentId === studentId && record.taskId === taskId,
      ) || null
    );
  }

  function buildLearningPlan(student) {
    const ascending = sortedDimensions("T3", student);
    const first = ascending[0];
    const second = ascending[1];
    const middle = ascending[2];
    const strength = ascending.at(-1);
    const weeks = [
      [
        { dim: first, index: 0 },
        { dim: second, index: 0 },
      ],
      [
        { dim: first, index: 1 },
        { dim: second, index: 1 },
      ],
      [
        { dim: first, index: 2 },
        { dim: middle, index: 0 },
      ],
      [
        { dim: second, index: 2 },
        { dim: strength, index: 1 },
      ],
    ];
    return weeks.map((week, weekIndex) =>
      week.map(({ dim, index }) => {
        const task = TASK_LIBRARY[dim.id][index];
        const supportPhrase =
          student.supportNeed === "优先学习支持"
            ? "当前支持需求为“优先学习支持”，建议缩小单次任务负荷并由教师确认节奏。"
            : student.supportNeed === "针对性学习支持"
              ? "当前支持需求为“针对性学习支持”，优先围绕相对低位维度进行有反馈的短周期练习。"
              : "当前支持需求为“常规学习支持”，可用拓展任务检验优势迁移。";
        return {
          id: `${dim.id}-${index}-W${weekIndex + 1}`,
          week: weekIndex + 1,
          name: task.name,
          dimensionId: dim.id,
          dimensionZh: dim.zh,
          dimensionScore: dim.score,
          reason: `T3 ${dim.zh}为 ${num(dim.score, 1)} 分，是当前六维中相对${index < 2 ? "较低" : "可拓展"}的维度。${supportPhrase}`,
          goal: task.goal,
          time: task.time,
          difficulty: task.difficulty,
          evaluation: task.evaluation,
        };
      }),
    );
  }

  function relevantRule(dimensionId) {
    const dimension = DIM_MAP[dimensionId];
    return (
      DATA.association.rules.find(
        (rule) =>
          rule.consequentText.includes(`${dimension.zh}突出`) &&
          rule.antecedentText.includes("任务完成率") &&
          rule.support >= 0.15,
      ) ||
      DATA.association.rules.find((rule) =>
        rule.consequentText.includes(`${dimension.zh}突出`),
      )
    );
  }

  function renderLearningPage() {
    const student = currentStudent();
    $("#learning-student-select").value = student.id;
    const plan = buildLearningPlan(student);
    const allTasks = plan.flat();
    const priority = sortedDimensions("T3", student)[0];
    const hero = $("#learning-hero");
    hero.innerHTML = "";
    hero.append(
      el(
        "div",
        { class: "learning-hero-main" },
        el("div", { class: "student-avatar" }, student.id.slice(-3)),
        el(
          "div",
          {},
          el("h2", {}, `${student.id} 的四周成长路径`),
          el(
            "p",
            {},
            `${student.grade} 年级 · ${student.clusterName} · 优先发展 ${priority.zh}`,
          ),
        ),
      ),
      learningKpi("支持需求", student.supportNeed, "T3 规则标签"),
      learningKpi("任务数量", `${allTasks.length} 项`, "每周 2 项"),
      learningKpi("计划周期", "4 周", "教师可调整"),
    );
    const weekTabs = $("#week-tabs");
    weekTabs.innerHTML = "";
    [1, 2, 3, 4].forEach((week) => {
      weekTabs.append(
        el(
          "button",
          {
            class: `week-tab ${state.week === week ? "active" : ""}`,
            onclick: () => {
              state.week = week;
              renderLearningPage();
            },
          },
          `第 ${week} 周`,
        ),
      );
    });
    const taskList = $("#learning-task-list");
    taskList.innerHTML = "";
    plan[state.week - 1].forEach((task, index) => {
      const feedback = getFeedback(student.id, task.id);
      taskList.append(
        el(
          "article",
          { class: "task-card" },
          el("span", { class: "task-number" }, `0${index + 1}`),
          el(
            "div",
            {},
            el("h3", {}, task.name),
            el("p", {}, task.reason),
            el(
              "div",
              { class: "task-meta" },
              el("span", {}, `${task.dimensionId} · ${task.dimensionZh}`),
              el("span", {}, task.time),
              el("span", {}, task.difficulty),
              el("span", {}, `评价：${task.evaluation}`),
            ),
            el("p", { class: "task-goal" }, el("strong", {}, "学习目标："), task.goal),
          ),
          el(
            "div",
            { class: "task-actions" },
            feedbackButton("适合我", "suitable", feedback, () =>
              saveFeedback(student, task, "suitable", "适合我"),
            ),
            feedbackButton("需调整", "adjust", feedback, () =>
              saveFeedback(student, task, "adjust", "需调整"),
            ),
            feedbackButton("已完成", "completed", feedback, () =>
              saveFeedback(student, task, "completed", "已完成"),
            ),
          ),
        ),
      );
    });
    const logic = $("#recommendation-logic");
    logic.innerHTML = "";
    const lowOne = sortedDimensions("T3", student)[0];
    const lowTwo = sortedDimensions("T3", student)[1];
    const rule = relevantRule(lowOne.id) || relevantRule(lowTwo.id);
    const logicRows = [
      ["WF-01", `先按 T3 六维得分升序定位相对发展重点：${lowOne.zh}、${lowTwo.zh}。`],
      ["WF-02", `再依据支持需求“${student.supportNeed}”调整任务强度与反馈频率。`],
      [
        "ASSOC",
        rule
          ? `关联规则参考 ${rule.id}：${rule.antecedentText} → ${rule.consequentText}（Lift ${num(rule.lift, 2)}）。仅作模式背景，不作因果依据。`
          : "当前未匹配到与优先维度直接相关的已运行关联规则，推荐仅依据能力结构与支持需求。",
      ],
      ["ETH-01", "所有建议均等待教师批准或修改；学生反馈不会自动改写能力得分。"],
    ];
    logicRows.forEach(([id, text]) => {
      logic.append(
        el(
          "div",
          { class: "logic-item" },
          el("span", { class: "logic-id" }, id),
          el("span", {}, text),
        ),
      );
    });
    logic.append(
      el(
        "div",
        { class: "transparent-rule" },
        "推荐机制未经过真实教育干预效果验证，不能表述为有效治疗方案或确定性成长路径。",
      ),
    );
    renderFeedbackSummary(student);
  }

  function learningKpi(label, value, note) {
    return el(
      "div",
      { class: "learning-kpi" },
      el("span", {}, label),
      el("strong", { style: { fontSize: String(value).length > 7 ? "14px" : "20px" } }, value),
      el("small", {}, note),
    );
  }

  function feedbackButton(label, status, current, action) {
    const button = el(
      "button",
      {
        class: `feedback-button ${current?.status === status ? "active" : ""}`,
      },
      label,
    );
    button.addEventListener("click", action);
    return button;
  }

  function saveFeedback(student, task, status, label) {
    const records = getFeedbackRecords().filter(
      (record) => !(record.studentId === student.id && record.taskId === task.id),
    );
    records.unshift({
      studentId: student.id,
      taskId: task.id,
      taskName: task.name,
      dimension: task.dimensionZh,
      status,
      label,
      timestamp: new Date().toISOString(),
    });
    writeLocal(STORAGE.feedback, records.slice(0, 300));
    toast(`已记录“${task.name}”：${label}`);
    renderLearningPage();
  }

  function renderFeedbackSummary(student) {
    const records = getFeedbackRecords()
      .filter((record) => record.studentId === student.id)
      .slice(0, 6);
    const host = $("#feedback-summary-list");
    host.innerHTML = "";
    if (!records.length) {
      host.append(el("div", { class: "empty-state" }, "尚未提交任务反馈。学生可从左侧任务中选择“适合我”“需调整”或“已完成”。"));
      return;
    }
    records.forEach((record) => {
      host.append(
        el(
          "div",
          { class: "feedback-record" },
          el("strong", {}, record.taskName),
          el("span", {}, `${record.label} · ${new Date(record.timestamp).toLocaleString("zh-CN")}`),
        ),
      );
    });
  }

  const CAREERS = [
    {
      id: "science",
      title: "科学研究",
      icon: "S",
      description: "围绕假设、实验与证据解释自然现象，在真实问题中练习科学论证。",
      abilities: ["S", "M", "C"],
      interest: "science",
      task: "设计一项校园微气候对照实验",
      direction: "可从科学社团、探究实验和研究性学习项目开始。",
      color: "#1570ef",
      bg: "#eaf2ff",
    },
    {
      id: "software",
      title: "软件与信息技术",
      icon: "T",
      description: "通过程序设计、数据组织和交互设计解决可被清晰描述的技术问题。",
      abilities: ["T", "I", "M"],
      interest: "technology",
      task: "制作一个学习数据可视化小工具",
      direction: "可从图形化编程、网页入门和校园数字工具改进开始。",
      color: "#0b8f91",
      bg: "#e8f8f5",
    },
    {
      id: "engineering",
      title: "工程设计",
      icon: "E",
      description: "在约束条件下设计方案、制作原型，并通过测试与迭代改进成果。",
      abilities: ["E", "M", "T"],
      interest: "engineering",
      task: "完成桥梁模型设计与承重测试",
      direction: "可从结构挑战、创客课程和工程设计竞赛开始。",
      color: "#7c5cfc",
      bg: "#f1eeff",
    },
    {
      id: "data",
      title: "数据分析",
      icon: "M",
      description: "从数据中识别模式、构建解释，并清楚说明模型假设与不确定性。",
      abilities: ["M", "T", "S"],
      interest: "math",
      task: "建立校园能源使用的简单预测模型",
      direction: "可从统计调查、可视化叙事和数学建模活动开始。",
      color: "#e28a07",
      bg: "#fff7e6",
    },
    {
      id: "environment",
      title: "环境科学",
      icon: "EC",
      description: "综合科学证据、系统思维与协作，理解人与环境的相互作用。",
      abilities: ["S", "M", "C"],
      interest: "science",
      task: "开展一次校园碳足迹调查",
      direction: "可从水质、空气质量与校园可持续发展项目开始。",
      color: "#0e8f62",
      bg: "#eafaf3",
    },
    {
      id: "manufacturing",
      title: "智能制造",
      icon: "SM",
      description: "把工程方案、数字工具和优化思维结合，探索自动化与柔性制造。",
      abilities: ["E", "T", "I"],
      interest: "engineering",
      task: "用传感器完成一个自动化小装置",
      direction: "可从机器人入门、3D 打印和制造流程体验开始。",
      color: "#c05b85",
      bg: "#fff1f6",
    },
    {
      id: "biotech",
      title: "生物技术",
      icon: "BT",
      description: "把生命科学观察、实验设计和数据分析结合，探索生物系统问题。",
      abilities: ["S", "M", "T"],
      interest: "science",
      task: "设计食品保存条件的比较观察",
      direction: "可从微生物观察、食品安全和生命科学实验开始。",
      color: "#4f7b19",
      bg: "#f2f8e8",
    },
  ];

  const INTEREST_META = {
    science: { label: "科学职业兴趣", short: "科学", color: "#1570ef" },
    technology: { label: "技术职业兴趣", short: "技术", color: "#0ea5a4" },
    engineering: { label: "工程职业兴趣", short: "工程", color: "#7c5cfc" },
    math: { label: "数学职业兴趣", short: "数学", color: "#f59e0b" },
  };

  function renderCareerPage() {
    const student = currentStudent();
    $("#career-student-select").value = student.id;
    $("#career-student-title").textContent = `${student.id} · T3 能力与职业兴趣`;
    const stage = student.stages.T3;
    const reference = groupMean("T3", student.grade);
    radarChart(
      $("#career-radar"),
      DIMS.map((dim) => stage.dimensions[dim.id]),
      DIMS.map((dim) => reference[dim.id]),
      {
        width: 500,
        height: 380,
        color: "#0ea5a4",
        label: `${student.id} 能力雷达`,
      },
    );
    const interestHost = $("#career-interest-bars");
    interestHost.innerHTML = "";
    Object.entries(INTEREST_META).forEach(([key, meta]) => {
      const value = stage.interests[key];
      const dots = el("div", { class: "interest-dots" });
      for (let index = 1; index <= 5; index += 1) {
        dots.append(el("i", { class: index <= value ? "filled" : "" }));
      }
      interestHost.append(
        el(
          "div",
          { class: "interest-row" },
          el("span", {}, meta.label, el("strong", {}, `${value} / 5`)),
          dots,
        ),
      );
    });
    const ranked = rankCareers(student);
    const guidance = $("#career-guidance");
    guidance.innerHTML = "";
    const topInterest = Object.entries(stage.interests).sort((a, b) => b[1] - a[1])[0];
    const topAbility = sortedDimensions("T3", student, true)[0];
    guidance.append(
      guidancePoint("01", "兴趣起点", `当前较强的职业兴趣是“${INTEREST_META[topInterest[0]].label}”（${topInterest[1]} / 5）。兴趣用于探索方向，不直接换算为职业概率。`),
      guidancePoint("02", "能力线索", `相对优势维度为${topAbility.zh}（${num(topAbility.score, 1)} 分），可作为体验任务中的能力起点。`),
      guidancePoint("03", "探索顺序", `当前建议优先了解“${ranked[0].career.title}”与“${ranked[1].career.title}”，随后通过体验任务再判断。`),
      guidancePoint("04", "边界提示", "当前能力较低不会排除任何职业方向；职业发展可以通过学习与经验不断改变。"),
    );
    const grid = $("#career-grid");
    grid.innerHTML = "";
    ranked.forEach((item, index) => {
      const career = item.career;
      const card = el(
        "article",
        {
          class: "career-card",
          style: {
            "--career-color": career.color,
            "--career-bg": career.bg,
            "--career-color-solid": career.color,
          },
        },
        el("span", { class: "career-rank" }, `探索 ${String(index + 1).padStart(2, "0")}`),
        el("span", { class: "career-icon" }, career.icon),
        el("h3", {}, career.title),
        el("p", {}, career.description),
        el(
          "div",
          { class: "career-tags" },
          ...career.abilities.map((dim) => el("span", {}, `${dim} · ${DIM_MAP[dim].zh}`)),
          el("span", {}, INTEREST_META[career.interest].short),
        ),
        el(
          "div",
          { class: "career-task" },
          el("span", {}, "推荐体验任务"),
          el("strong", {}, career.task),
          el("p", { class: "career-direction" }, career.direction),
        ),
        el("span", { class: "career-status" }, item.status),
      );
      grid.append(card);
    });
  }

  function rankCareers(student) {
    const stage = student.stages.T3;
    return CAREERS.map((career) => {
      const abilityMean =
        career.abilities.reduce((sum, dim) => sum + stage.dimensions[dim], 0) /
        career.abilities.length;
      const interest = stage.interests[career.interest];
      const orderedInterest = (interest - 1) / 4 * 100;
      const orderedAbility = abilityMean;
      const interestStrong = interest >= 4;
      const abilityStrong = abilityMean >= 65;
      const status = interestStrong
        ? abilityStrong
          ? "兴趣与能力可共同探索"
          : "兴趣驱动型探索"
        : abilityStrong
          ? "能力优势可延展"
          : "可从小任务开始体验";
      return {
        career,
        abilityMean,
        interest,
        score: orderedInterest * 0.58 + orderedAbility * 0.42,
        status,
      };
    }).sort((a, b) => b.score - a.score);
  }

  function guidancePoint(number, title, body) {
    return el(
      "div",
      { class: "guidance-point" },
      el("span", {}, number),
      el("div", {}, el("strong", {}, title), el("p", {}, body)),
    );
  }

  function renderReviewStudentOptions() {
    const select = $("#review-student-select");
    if (!select) return;
    const filtered = DATA.students.filter(
      (student) =>
        !state.reviewSearch ||
        student.id.includes(state.reviewSearch) ||
        student.supportNeed.includes(state.reviewSearch),
    );
    const previous = filtered.some((student) => student.id === state.studentId)
      ? state.studentId
      : filtered[0]?.id || state.studentId;
    select.innerHTML = filtered
      .map(
        (student) =>
          `<option value="${student.id}" ${student.id === previous ? "selected" : ""}>${student.id} · ${student.grade}年级 · ${student.supportNeed}</option>`,
      )
      .join("");
    select.onchange = () => setStudent(select.value);
  }

  function renderGovernancePage() {
    renderReviewStudentOptions();
    const supportCounts = DATA.classification.classCounts;
    const metricsHost = $("#governance-metrics");
    metricsHost.innerHTML = "";
    [
      ["优先支持学生", supportCounts["优先学习支持"], "需要教师优先审阅"],
      ["针对性支持学生", supportCounts["针对性学习支持"], "建议短周期反馈"],
      ["常规支持学生", supportCounts["常规学习支持"], "保持常规观察"],
      ["已完成插补", DATA.missingComparison.rowsImputed, "三阶段记录合计"],
    ].forEach(([label, value, note]) => {
      metricsHost.append(
        el(
          "div",
          { class: "governance-metric" },
          el("span", {}, label),
          el("strong", {}, value),
          el("small", {}, note),
        ),
      );
    });
    barChart(
      $("#support-distribution-chart"),
      [
        { label: "常规支持", value: supportCounts["常规学习支持"], color: "#0ea5a4", tooltip: "常规学习支持人数" },
        { label: "针对性支持", value: supportCounts["针对性学习支持"], color: "#1570ef", tooltip: "针对性学习支持人数" },
        { label: "优先支持", value: supportCounts["优先学习支持"], color: "#e85d75", tooltip: "优先学习支持人数" },
      ],
      {
        width: 620,
        height: 260,
        max: 100,
        barWidth: 62,
        label: "支持需求分布",
      },
    );
    const clusterHost = $("#cluster-distribution");
    clusterHost.innerHTML = "";
    DATA.clustering.clusters.forEach((cluster, index) => {
      const color = ["#1570ef", "#0ea5a4", "#7c5cfc", "#f59e0b", "#e85d75"][index];
      clusterHost.append(
        el(
          "div",
          { class: "cluster-dist-item" },
          el(
            "div",
            { class: "cluster-dist-head" },
            el("span", {}, cluster.name),
            el("strong", {}, `${cluster.size} 人 · ${pct(cluster.share)}`),
          ),
          el(
            "span",
            { class: "mini-score-bar", style: { width: "100%" } },
            el("i", { style: { width: `${cluster.share * 100}%`, background: color } }),
          ),
        ),
      );
    });
    const reviewSearch = $("#review-search");
    reviewSearch.value = state.reviewSearch;
    reviewSearch.oninput = () => {
      state.reviewSearch = reviewSearch.value.trim().toUpperCase();
      renderReviewStudentOptions();
      const select = $("#review-student-select");
      if (select.value && select.value !== state.studentId) state.studentId = select.value;
      renderReviewWorkspace();
    };
    renderReviewWorkspace();
    renderFairnessTable();
    renderEthicsCards();
    renderReviewHistory();
    $("#clear-review-history").onclick = () => {
      if (window.confirm("确定清空当前浏览器中的教师审核记录吗？此操作不可撤销。")) {
        writeLocal(STORAGE.reviews, []);
        renderGovernancePage();
        toast("已清空本机教师审核记录");
      }
    };
  }

  function teacherTasks(student) {
    return buildLearningPlan(student).flat().slice(0, 6);
  }

  function latestReview(studentId, taskId) {
    return readLocal(STORAGE.reviews, []).find(
      (record) => record.studentId === studentId && record.taskId === taskId,
    );
  }

  function renderReviewWorkspace() {
    const student = currentStudent();
    const summary = $("#review-student-summary");
    summary.innerHTML = "";
    summary.append(
      el("div", { class: "student-avatar" }, student.id.slice(-3)),
      el("h3", {}, student.id),
      el("p", {}, `${student.grade} 年级 · ${student.clusterName}`),
      summaryRow("综合能力", num(student.stages.T3.overall, 1)),
      summaryRow("支持需求", student.supportNeed),
      summaryRow("优先发展", sortedDimensions("T3", student)[0].zh),
      summaryRow("数据质量", student.imputationCountTotal ? `插补 ${student.imputationCountTotal} 项` : "完整"),
    );
    const list = $("#review-list");
    list.innerHTML = "";
    teacherTasks(student).forEach((task) => {
      const record = latestReview(student.id, task.id);
      const card = el(
        "article",
        { class: "review-item" },
        el(
          "div",
          {},
          el("h3", {}, record?.teacherTaskName || task.name),
          el("p", {}, `${task.dimensionId} · ${task.dimensionZh} · ${task.difficulty} · ${task.time}`),
          el("p", { style: { marginTop: "5px" } }, record?.teacherReason || task.reason),
          el(
            "span",
            { class: `review-status ${record?.status || ""}` },
            record ? `已${reviewStatusLabel(record.status)}` : "待教师审核",
          ),
        ),
      );
      const actions = el(
        "div",
        { class: "review-actions" },
        reviewButton("批准", "approve", () => saveTeacherReview(student, task, "approved", "批准推荐")),
        reviewButton("修改", "", () => openModifyDialog(student, task)),
        reviewButton("暂缓", "defer", () => saveTeacherReview(student, task, "deferred", "暂缓推荐")),
      );
      card.append(actions);
      list.append(card);
    });
  }

  function summaryRow(label, value) {
    return el(
      "div",
      { class: "summary-row" },
      el("span", {}, label),
      el("strong", { style: { fontSize: String(value).length > 8 ? "8px" : "" } }, value),
    );
  }

  function reviewButton(label, tone, action) {
    const button = el("button", { class: `review-action ${tone}` }, label);
    button.addEventListener("click", action);
    return button;
  }

  function reviewStatusLabel(status) {
    return { approved: "批准", modified: "修改", deferred: "暂缓" }[status] || status;
  }

  function saveTeacherReview(student, task, status, action, teacherTaskName = task.name, teacherReason = "") {
    const records = readLocal(STORAGE.reviews, []).filter(
      (record) => !(record.studentId === student.id && record.taskId === task.id),
    );
    records.unshift({
      studentId: student.id,
      taskId: task.id,
      originalTaskName: task.name,
      teacherTaskName,
      teacherReason,
      status,
      action,
      timestamp: new Date().toISOString(),
    });
    writeLocal(STORAGE.reviews, records.slice(0, 500));
    toast(`${student.id} · ${teacherTaskName}：${action}`);
    renderReviewWorkspace();
    renderReviewHistory();
  }

  let modifyContext = null;
  function openModifyDialog(student, task) {
    modifyContext = { student, task };
    $("#modify-task-name").value = task.name;
    $("#modify-task-reason").value = "";
    $("#modify-dialog").showModal();
  }

  function initModifyDialog() {
    const dialog = $("#modify-dialog");
    dialog.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!modifyContext) return;
      const name = $("#modify-task-name").value.trim();
      if (!name) return;
      const reason = $("#modify-task-reason").value.trim();
      saveTeacherReview(
        modifyContext.student,
        modifyContext.task,
        "modified",
        "修改推荐",
        name,
        reason,
      );
      dialog.close();
      modifyContext = null;
    });
    $$('button[value="cancel"]', dialog).forEach((button) => {
      button.addEventListener("click", () => dialog.close());
    });
  }

  function renderReviewHistory() {
    const host = $("#review-history");
    const records = readLocal(STORAGE.reviews, []).slice(0, 12);
    host.innerHTML = "";
    if (!records.length) {
      host.append(el("div", { class: "empty-state" }, "尚无教师审核记录。审核状态仅保存在当前浏览器。"));
      return;
    }
    records.forEach((record) => {
      host.append(
        el(
          "div",
          { class: "history-entry" },
          el("strong", {}, `${record.studentId} · ${record.teacherTaskName}`),
          el(
            "span",
            {},
            `${record.action}${record.teacherReason ? ` · ${record.teacherReason}` : ""}`,
          ),
          el("time", {}, new Date(record.timestamp).toLocaleString("zh-CN")),
        ),
      );
    });
  }

  function renderFairnessTable() {
    const body = $("#fairness-table").tBodies[0];
    body.innerHTML = "";
    const testIds = new Set(DATA.classification.split.testIds);
    const regressionMap = new Map(
      DATA.regression.scatter.map((item) => [item.studentId, Math.abs(item.residual)]),
    );
    [7, 8, 9].forEach((grade) => {
      const all = DATA.students.filter((student) => student.grade === grade);
      const test = all.filter((student) => testIds.has(student.id));
      const correct = test.filter(
        (student) => student.classPrediction === student.supportNeed,
      ).length;
      const errors = test
        .map((student) => regressionMap.get(student.id))
        .filter((value) => value !== undefined);
      const priorityShare =
        all.filter((student) => student.supportNeed === "优先学习支持").length / all.length;
      body.append(
        el(
          "tr",
          {},
          el("td", {}, `${grade} 年级`),
          el("td", {}, test.length),
          el("td", {}, `${correct} / ${test.length}`),
          el("td", {}, num(errors.reduce((sum, value) => sum + value, 0) / errors.length, 2)),
          el("td", {}, pct(priorityShare)),
        ),
      );
    });
  }

  const ETHICS = [
    ["01", "合成数据声明", "全部学生、测评与行为变量均由固定种子脚本合成，不含真实身份信息。"],
    ["02", "未成年人数据保护", "原型不采集真实未成年人数据；未来接入真实数据前需完成机构审查与监护人程序。"],
    ["03", "数据最小化", "仅保留研究问题所需能力与行为字段，职业兴趣独立测量，不无界扩展采集。"],
    ["04", "算法公平性", "年级误差比较仅作描述；未使用敏感属性不代表算法自动公平，仍需真实场景审计。"],
    ["05", "标签化风险", "聚类与支持需求只用于支持设计，禁止使用“差生”“低潜力”等固定身份标签。"],
    ["06", "模型可解释性", "页面展示实际特征重要性、树规则、聚类中心和关联阈值，并说明各自局限。"],
    ["07", "教师最终决策", "系统提供参考建议，教师可批准、修改或暂缓；算法不替代专业判断。"],
    ["08", "学生反馈与纠错", "学生可反馈任务适合度，教师记录审核状态；当前原型尚不提供正式申诉流程。"],
  ];

  function renderEthicsCards() {
    const host = $("#ethics-card-grid");
    host.innerHTML = "";
    ETHICS.forEach(([number, title, body]) => {
      host.append(
        el(
          "article",
          { class: "ethics-card" },
          el("span", {}, number),
          el("h3", {}, title),
          el("p", {}, body),
        ),
      );
    });
  }

  function downloadCurrentPlan() {
    const student = currentStudent();
    const plan = buildLearningPlan(student);
    const lines = [
      `# ${student.id} 四周个性化学习发展计划`,
      "",
      `- 年级：${student.grade}`,
      `- T3 综合能力：${num(student.stages.T3.overall, 2)}`,
      `- 支持需求：${student.supportNeed}`,
      `- 聚类特征：${student.clusterName}`,
      "",
      "> 本计划由课程研究原型基于透明规则生成，尚未经过真实教育干预效果验证，最终由教师审核。",
      "",
    ];
    plan.forEach((week, index) => {
      lines.push(`## 第 ${index + 1} 周`);
      week.forEach((task) => {
        lines.push(`### ${task.name}`);
        lines.push(`- 对应能力：${task.dimensionId} · ${task.dimensionZh}`);
        lines.push(`- 推荐原因：${task.reason}`);
        lines.push(`- 学习目标：${task.goal}`);
        lines.push(`- 建议时间：${task.time}`);
        lines.push(`- 难度等级：${task.difficulty}`);
        lines.push(`- 评价方式：${task.evaluation}`);
        lines.push("");
      });
    });
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: `${student.id}_STEM_learning_plan.md` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("学习发展计划已导出");
  }

  function init() {
    initNavigation();
    initStudentSelectors();
    initModifyDialog();
    $("#download-plan-button").addEventListener("click", downloadCurrentPlan);
    const page = location.hash.replace("#", "") || "overview";
    navigate(page);
  }

  init();
})();
