// File/Text Diff Tool - Robust Source-State Version

document.addEventListener("DOMContentLoaded", function () {
  const inputA = document.getElementById('inputA');
  const inputB = document.getElementById('inputB');
  // Menu bar controls
  const fileA = document.getElementById('fileA');
  const fileB = document.getElementById('fileB');
  const clearABtn = document.getElementById('clearA');
  const clearBBtn = document.getElementById('clearB');
  const copyFromA = document.getElementById('copyFromA'); // copy all from Source → Target
  const copyFromB = document.getElementById('copyFromB'); // copy all from Target → Source
  const fileAName = document.getElementById('fileAName');
  const fileBName = document.getElementById('fileBName');
  const ignoreMinor = document.getElementById('ignoreMinor');

  // True source text for diffing and copying (always as plain string, never HTML)
  let sourceA = '';
  let sourceB = '';

  // Get plain text content from a contenteditable
  function getText(el) {
    return el.innerText.replace(/\r/g, '');
  }

  // Set HTML with diff spans, but allow user cursor to resume
  function setHTMLkeepCaret(el, html) {
    // Try to preserve caret after update
    const selection = window.getSelection();
    let caretOffset = null;

    if (selection.anchorNode && el.contains(selection.anchorNode)) {
      const preCaretRange = document.createRange();
      preCaretRange.setStart(el, 0);
      preCaretRange.setEnd(selection.anchorNode, selection.anchorOffset);
      caretOffset = preCaretRange.toString().length;
    }
    el.innerHTML = html;
    // Restore caret at previous offset
    if (caretOffset != null) {
      placeCaret(el, caretOffset);
    }
  }

  function placeCaret(editableDiv, chars) {
    let node = editableDiv;
    let stack = [];
    let length = 0;
    let found = false;
    stack.push({ node: editableDiv, pos: 0 });
    while (stack.length && !found) {
      let { node, pos } = stack.pop();
      if (node.nodeType === 3) { // text node
        if (length + node.data.length >= chars) {
          let sel = window.getSelection();
          let range = document.createRange();
          range.setStart(node, chars - length);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          found = true;
        }
        length += node.data.length;
      } else if (node.nodeType === 1 && node.childNodes.length > 0) {
        for (let i = node.childNodes.length - 1; i >= 0; --i) {
          stack.push({ node: node.childNodes[i], pos: 0 });
        }
      }
    }
  }

  function normLine(line) {
    return line.replace(/[\s\t]/g, '');
  }

  function trimLinesAndSpaces(str) {
    // Remove blank lines at start/end and trim whitespace
    return str.replace(/^\s*\n+/g, '').replace(/\n+\s*$/g, '').trim();
  }

  // Diff logic (line-by-line, returns HTML for A and B) with per-line copy buttons
  function diffLines(a, b, ignoreMinorChecked) {
    const aLines = a.split('\n');
    const bLines = b.split('\n');
    let i = 0, j = 0, currIndex = 0;
    const diffA = [], diffB = [];
    while (i < aLines.length || j < bLines.length) {
      let eq = false;
      if (i < aLines.length && j < bLines.length) {
        if (ignoreMinorChecked) {
          eq = (normLine(aLines[i]) === normLine(bLines[j]));
        } else {
          eq = (aLines[i] === bLines[j]);
        }
      }
      if (i < aLines.length && j < bLines.length) {
        if (eq) {
          diffA.push(`<div data-line-idx="${currIndex}">
            <span class="line-margin">
              <span class="line-num">${i+1}</span>
            </span>
            <span class="diff-eql">${escapeHtml(aLines[i])}</span>
          </div>`);
          diffB.push(`<div data-line-idx="${currIndex}">
            <span class="line-margin">
              <span class="line-num">${j+1}</span>
            </span>
            <span class="diff-eql">${escapeHtml(bLines[j])}</span>
          </div>`);
          i++; j++; currIndex++;
        } else if (!bLines.includes(aLines[i])) {
          diffA.push(`<div data-line-idx="${currIndex}">
            <span class="line-margin">
              <button class="line-copy-btn" data-from="a" data-line="${encodeURIComponent(aLines[i])}" data-line-idx-source="${i}" title="Copy to B">⇨</button>
              <span class="line-num">${i+1}</span>
            </span>
            <span class="diff-del">${escapeHtml(aLines[i])}</span>
          </div>`);
          diffB.push(`<div data-line-idx="${currIndex}">
            <span class="line-margin">
              <span class="line-num"></span>
            </span>
            <span class="diff-ins"> </span>
          </div>`);
          i++; currIndex++;
        } else if (!aLines.includes(bLines[j])) {
          diffA.push(`<div data-line-idx="${currIndex}">
            <span class="line-margin">
              <span class="line-num"></span>
            </span>
            <span class="diff-ins"> </span>
          </div>`);
          diffB.push(`<div data-line-idx="${currIndex}">
            <span class="line-margin">
              <button class="line-copy-btn" data-from="b" data-line="${encodeURIComponent(bLines[j])}" data-line-idx-source="${j}" title="Copy to A">⇦</button>
              <span class="line-num">${j+1}</span>
            </span>
            <span class="diff-ins">${escapeHtml(bLines[j])}</span>
          </div>`);
          j++; currIndex++;
        } else {
          diffA.push(`<div data-line-idx="${currIndex}">
            <span class="line-margin">
              <button class="line-copy-btn" data-from="a" data-line="${encodeURIComponent(aLines[i])}" data-line-idx-source="${i}" title="Copy to B">⇨</button>
              <span class="line-num">${i+1}</span>
            </span>
            <span class="diff-del">${escapeHtml(aLines[i])}</span>
          </div>`);
          diffB.push(`<div data-line-idx="${currIndex}">
            <span class="line-margin">
              <button class="line-copy-btn" data-from="b" data-line="${encodeURIComponent(bLines[j])}" data-line-idx-source="${j}" title="Copy to A">⇦</button>
              <span class="line-num">${j+1}</span>
            </span>
            <span class="diff-ins">${escapeHtml(bLines[j])}</span>
          </div>`);
          i++; j++; currIndex++;
        }
      } else if (i < aLines.length) {
        diffA.push(`<div data-line-idx="${currIndex}">
          <span class="line-margin">
            <button class="line-copy-btn" data-from="a" data-line="${encodeURIComponent(aLines[i])}" title="Copy to B">⇨</button>
            <span class="line-num">${i+1}</span>
          </span>
          <span class="diff-del">${escapeHtml(aLines[i])}</span>
        </div>`);
        diffB.push(`<div data-line-idx="${currIndex}">
          <span class="line-margin">
            <span class="line-num"></span>
          </span>
          <span class="diff-ins"> </span>
        </div>`);
        i++; currIndex++;
      } else if (j < bLines.length) {
        diffA.push(`<div data-line-idx="${currIndex}">
          <span class="line-margin">
            <span class="line-num"></span>
          </span>
          <span class="diff-ins"> </span>
        </div>`);
        diffB.push(`<div data-line-idx="${currIndex}">
          <span class="line-margin">
            <button class="line-copy-btn" data-from="b" data-line="${encodeURIComponent(bLines[j])}" title="Copy to A">⇦</button>
            <span class="line-num">${j+1}</span>
          </span>
          <span class="diff-ins">${escapeHtml(bLines[j])}</span>
        </div>`);
        j++; currIndex++;
      }
    }
    return {
      a: diffA.join(''),
      b: diffB.join('')
    };
  }

  function escapeHtml(str) {
    return str.replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">");
  }

  // --- Diff View rendering logic ---
  function renderDiff() {
    console.log('[RENDER] renderDiff called. sourceA:', sourceA, '| sourceB:', sourceB);
    // updated: only programmatically blank out the editor if not focused (avoid erasing user typing)
    let cleanA = trimLinesAndSpaces(sourceA);
    let cleanB = trimLinesAndSpaces(sourceB);

    // If user is focused and the editor is empty, don't touch the HTML (so typing works)
    const activeEl = document.activeElement;
    if (!cleanA) {
      if (activeEl !== inputA) inputA.innerHTML = "";
    } else {
      const diffA = diffLines(cleanA, cleanB, ignoreMinor && ignoreMinor.checked).a;
      setHTMLkeepCaret(inputA, diffA);
    }
    if (!cleanB) {
      if (activeEl !== inputB) inputB.innerHTML = "";
    } else {
      const diffB = diffLines(cleanA, cleanB, ignoreMinor && ignoreMinor.checked).b;
      setHTMLkeepCaret(inputB, diffB);
    }
    attachLineCopyHandlers();
    console.log('[RENDER] renderDiff finished');
  }

  // On input, update source then render diff
  function handleInputSourceA() {
    sourceA = getText(inputA);
    renderDiff();
  }
  function handleInputSourceB() {
    sourceB = getText(inputB);
    renderDiff();
  }

  inputA.addEventListener('input', handleInputSourceA);
  inputB.addEventListener('input', handleInputSourceB);
  inputA.addEventListener('paste', handleInputSourceA);
  inputB.addEventListener('paste', handleInputSourceB);

  // React on ignoreMinor checkbox
  if (ignoreMinor) {
    ignoreMinor.addEventListener('change', renderDiff);
  }

  // File input + file name UI handling for A/B
  function handleFileInput(fileInput, fileNameEl, which) {
    const file = fileInput.files[0];
    if (!file) return;
    fileNameEl.textContent = file.name || '';
    const reader = new FileReader();
    reader.onload = (e) => {
      if (which === "a") {
        sourceA = e.target.result;
      } else {
        sourceB = e.target.result;
      }
      renderDiff();
    };
    reader.readAsText(file);
  }
  fileA.addEventListener('change', () => handleFileInput(fileA, fileAName, "a"));
  fileB.addEventListener('change', () => handleFileInput(fileB, fileBName, "b"));

  // Bulk copy: menu bar buttons only
  copyFromA.addEventListener('click', function () {
    let aLines = trimLinesAndSpaces(sourceA).split('\n');
    let bLines = trimLinesAndSpaces(sourceB).split('\n');
    // Copy all lines from Source (A) to Target (B)
    const merged = [...bLines];
    aLines.forEach(line => {
      if (line.trim() && !bLines.includes(line)) {
        merged.push(line);
      }
    });
    sourceB = merged.join('\n');
    renderDiff();
  });
  copyFromB.addEventListener('click', function () {
    let aLines = trimLinesAndSpaces(sourceA).split('\n');
    let bLines = trimLinesAndSpaces(sourceB).split('\n');
    // Copy all lines from Target (B) to Source (A)
    const merged = [...aLines];
    bLines.forEach(line => {
      if (line.trim() && !aLines.includes(line)) {
        merged.push(line);
      }
    });
    sourceA = merged.join('\n');
    renderDiff();
  });

  // Individual line copy logic using event delegation
  // Robust direct handler for all current copy buttons after each diff render
  function attachLineCopyHandlers() {
    // Left editor (copy from A to B)
    inputA.querySelectorAll('.line-copy-btn').forEach((btn, idxBtn) => {
      btn.onclick = function(e) {
        e.preventDefault();
        const div = btn.closest('[data-line-idx]');
        const idxSourceStr = btn.getAttribute('data-line-idx-source');
        const idxSource = idxSourceStr ? parseInt(idxSourceStr, 10) : NaN;
        console.log(`[COPY-A->B] Click on LEFT copy line. diff-idx:`, div && div.getAttribute('data-line-idx'), 'line-idx-source:', idxSourceStr, 'div:', div);
        if (!(typeof idxSource === "number" && idxSource >= 0)) return;
        const aLines = trimLinesAndSpaces(sourceA).split('\n');
        const realLine = aLines[idxSource];
        let linesB = trimLinesAndSpaces(sourceB).split('\n');
        // Insert at visual diff position, or append if out of range
        if (div) {
          const visIdx = parseInt(div.getAttribute('data-line-idx'), 10);
          if (!isNaN(visIdx) && visIdx >= 0 && visIdx <= linesB.length) {
            linesB.splice(visIdx, 0, realLine);
            console.log(`[COPY-A->B] Inserted at index`, visIdx);
          } else {
            linesB.push(realLine);
            console.log(`[COPY-A->B] Appended at end`);
          }
        } else {
          linesB.push(realLine);
        }
        console.log(`[COPY-A->B] Line text copied:`, realLine, 'to B. B lines now:', linesB.length);
        sourceB = linesB.join('\n');
        renderDiff();
      };
      console.log(`[ATTACH] Attached copy handler LEFT idx:`, idxBtn);
    });
    // Right editor (copy from B to A)
    inputB.querySelectorAll('.line-copy-btn').forEach((btn, idxBtn) => {
      btn.onclick = function(e) {
        e.preventDefault();
        const div = btn.closest('[data-line-idx]');
        const idxSourceStr = btn.getAttribute('data-line-idx-source');
        const idxSource = idxSourceStr ? parseInt(idxSourceStr, 10) : NaN;
        console.log(`[COPY-B->A] Click on RIGHT copy line. diff-idx:`, div && div.getAttribute('data-line-idx'), 'line-idx-source:', idxSourceStr, 'div:', div);
        if (!(typeof idxSource === "number" && idxSource >= 0)) return;
        const bLines = trimLinesAndSpaces(sourceB).split('\n');
        const realLine = bLines[idxSource];
        let linesA = trimLinesAndSpaces(sourceA).split('\n');
        if (div) {
          const visIdx = parseInt(div.getAttribute('data-line-idx'), 10);
          if (!isNaN(visIdx) && visIdx >= 0 && visIdx <= linesA.length) {
            linesA.splice(visIdx, 0, realLine);
            console.log(`[COPY-B->A] Inserted at index`, visIdx);
          } else {
            linesA.push(realLine);
            console.log(`[COPY-B->A] Appended at end`);
          }
        } else {
          linesA.push(realLine);
        }
        console.log(`[COPY-B->A] Line text copied:`, realLine, 'to A. A lines now:', linesA.length);
        sourceA = linesA.join('\n');
        renderDiff();
      };
      console.log(`[ATTACH] Attached copy handler RIGHT idx:`, idxBtn);
    });
    console.log('[ATTACH] attachLineCopyHandlers completed');
  }

  // Synchronized scrolling
  let isSyncScrollA = false, isSyncScrollB = false;
  inputA.addEventListener('scroll', function() {
    if (isSyncScrollA) { isSyncScrollA = false; return; }
    isSyncScrollB = true;
    inputB.scrollTop = inputA.scrollTop;
    inputB.scrollLeft = inputA.scrollLeft;
  });
  inputB.addEventListener('scroll', function() {
    if (isSyncScrollB) { isSyncScrollB = false; return; }
    isSyncScrollA = true;
    inputA.scrollTop = inputB.scrollTop;
    inputA.scrollLeft = inputB.scrollLeft;
  });

  // Individual clear buttons
  clearABtn.addEventListener('click', function() {
    sourceA = "";
    renderDiff();
    inputA.focus();
  });
  clearBBtn.addEventListener('click', function() {
    sourceB = "";
    renderDiff();
    inputB.focus();
  });

  // --- Initial setup: keep state and UI in sync ---
  // On load, sync up the text from editors (should be blank)
  sourceA = "";
  sourceB = "";
  inputA.innerHTML = "";
  inputB.innerHTML = "";
  renderDiff();
});
