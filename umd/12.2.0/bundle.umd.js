(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('@testing-library/dom')) :
  typeof define === 'function' && define.amd ? define(['@testing-library/dom'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.TestingLibraryUserEvent = factory(global.TestingLibraryDom));
}(this, (function (dom) { 'use strict';

  function isMousePressEvent(event) {
    return (
      event === 'mousedown' ||
      event === 'mouseup' ||
      event === 'click' ||
      event === 'dblclick'
    )
  }

  function invert(map) {
    const res = {};
    for (const key of Object.keys(map)) {
      res[map[key]] = key;
    }

    return res
  }

  // https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/buttons
  const BUTTONS_TO_NAMES = {
    0: 'none',
    1: 'primary',
    2: 'secondary',
    4: 'auxiliary',
  };
  const NAMES_TO_BUTTONS = invert(BUTTONS_TO_NAMES);

  // https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
  const BUTTON_TO_NAMES = {
    0: 'primary',
    1: 'auxiliary',
    2: 'secondary',
  };

  const NAMES_TO_BUTTON = invert(BUTTON_TO_NAMES);

  function convertMouseButtons(event, init, property, mapping) {
    if (!isMousePressEvent(event)) {
      return 0
    }

    if (init[property] != null) {
      return init[property]
    }

    if (init.buttons != null) {
      // not sure how to test this. Feel free to try and add a test if you want.
      // istanbul ignore next
      return mapping[BUTTONS_TO_NAMES[init.buttons]] || 0
    }

    if (init.button != null) {
      // not sure how to test this. Feel free to try and add a test if you want.
      // istanbul ignore next
      return mapping[BUTTON_TO_NAMES[init.button]] || 0
    }

    return property != 'button' && isMousePressEvent(event) ? 1 : 0
  }

  function getMouseEventOptions(event, init, clickCount = 0) {
    init = init || {};
    return {
      ...init,
      // https://developer.mozilla.org/en-US/docs/Web/API/UIEvent/detail
      detail:
        event === 'mousedown' || event === 'mouseup' || event === 'click'
          ? 1 + clickCount
          : clickCount,
      buttons: convertMouseButtons(event, init, 'buttons', NAMES_TO_BUTTONS),
      button: convertMouseButtons(event, init, 'button', NAMES_TO_BUTTON),
    }
  }

  // Absolutely NO events fire on label elements that contain their control
  // if that control is disabled. NUTS!
  // no joke. There are NO events for: <label><input disabled /><label>
  function isLabelWithInternallyDisabledControl(element) {
    return (
      element.tagName === 'LABEL' &&
      element.control?.disabled &&
      element.contains(element.control)
    )
  }

  function getActiveElement(document) {
    const activeElement = document.activeElement;
    if (activeElement?.shadowRoot) {
      return getActiveElement(activeElement.shadowRoot)
    } else {
      return activeElement
    }
  }

  function supportsMaxLength(element) {
    if (element.tagName === 'TEXTAREA') return true

    if (element.tagName === 'INPUT') {
      const type = element.getAttribute('type');

      // Missing value default is "text"
      if (!type) return true

      // https://html.spec.whatwg.org/multipage/input.html#concept-input-apply
      if (type.match(/email|password|search|telephone|text|url/)) return true
    }

    return false
  }

  function getSelectionRange(element) {
    if (isContentEditable(element)) {
      const range = element.ownerDocument.getSelection().getRangeAt(0);

      return {selectionStart: range.startOffset, selectionEnd: range.endOffset}
    }

    return {
      selectionStart: element.selectionStart,
      selectionEnd: element.selectionEnd,
    }
  }

  //jsdom is not supporting isContentEditable
  function isContentEditable(element) {
    return (
      element.hasAttribute('contenteditable') &&
      (element.getAttribute('contenteditable') == 'true' ||
        element.getAttribute('contenteditable') == '')
    )
  }

  function getValue(element) {
    if (isContentEditable(element)) {
      return element.textContent
    }
    return element.value
  }

  function calculateNewValue(newEntry, element) {
    const {selectionStart, selectionEnd} = getSelectionRange(element);
    const value = getValue(element);

    // can't use .maxLength property because of a jsdom bug:
    // https://github.com/jsdom/jsdom/issues/2927
    const maxLength = Number(element.getAttribute('maxlength') ?? -1);
    let newValue, newSelectionStart;

    if (selectionStart === null) {
      // at the end of an input type that does not support selection ranges
      // https://github.com/testing-library/user-event/issues/316#issuecomment-639744793
      newValue = value + newEntry;
    } else if (selectionStart === selectionEnd) {
      if (selectionStart === 0) {
        // at the beginning of the input
        newValue = newEntry + value;
      } else if (selectionStart === value.length) {
        // at the end of the input
        newValue = value + newEntry;
      } else {
        // in the middle of the input
        newValue =
          value.slice(0, selectionStart) + newEntry + value.slice(selectionEnd);
      }
      newSelectionStart = selectionStart + newEntry.length;
    } else {
      // we have something selected
      const firstPart = value.slice(0, selectionStart) + newEntry;
      newValue = firstPart + value.slice(selectionEnd);
      newSelectionStart = firstPart.length;
    }

    if (element.type === 'date' && !isValidDateValue(element, newValue)) {
      newValue = value;
    }

    if (!supportsMaxLength(element) || maxLength < 0) {
      return {newValue, newSelectionStart}
    } else {
      return {
        newValue: newValue.slice(0, maxLength),
        newSelectionStart:
          newSelectionStart > maxLength ? maxLength : newSelectionStart,
      }
    }
  }

  function setSelectionRangeIfNecessary(
    element,
    newSelectionStart,
    newSelectionEnd,
  ) {
    const {selectionStart, selectionEnd} = getSelectionRange(element);

    if (
      !isContentEditable(element) &&
      (!element.setSelectionRange || selectionStart === null)
    ) {
      // cannot set selection
      return
    }
    if (
      selectionStart !== newSelectionStart ||
      selectionEnd !== newSelectionStart
    ) {
      if (isContentEditable(element)) {
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(element);
        range.setStart(element.firstChild, newSelectionStart);
        range.setEnd(element.firstChild, newSelectionEnd);
        element.ownerDocument.getSelection().removeAllRanges();
        element.ownerDocument.getSelection().addRange(range);
      } else {
        element.setSelectionRange(newSelectionStart, newSelectionEnd);
      }
    }
  }

  const FOCUSABLE_SELECTOR = [
    'input:not([type=hidden]):not([disabled])',
    'button:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[contenteditable=""]',
    '[contenteditable="true"]',
    'a[href]',
    '[tabindex]:not([disabled])',
  ].join(', ');

  function isFocusable(element) {
    return (
      !isLabelWithInternallyDisabledControl(element) &&
      element?.matches(FOCUSABLE_SELECTOR)
    )
  }

  const CLICKABLE_INPUT_TYPES = [
    'button',
    'color',
    'file',
    'image',
    'reset',
    'submit',
  ];

  function isClickable(element) {
    return (
      element.tagName === 'BUTTON' ||
      (element instanceof element.ownerDocument.defaultView.HTMLInputElement &&
        CLICKABLE_INPUT_TYPES.includes(element.type))
    )
  }

  function eventWrapper(cb) {
    let result;
    dom.getConfig().eventWrapper(() => {
      result = cb();
    });
    return result
  }

  function isValidDateValue(element, value) {
    if (element.type !== 'date') return false

    const clone = element.cloneNode();
    clone.value = value;
    return clone.value === value
  }

  // includes `element`
  function getParentElements(element) {
    const parentElements = [element];
    let currentElement = element;
    while ((currentElement = currentElement.parentElement) != null) {
      parentElements.push(currentElement);
    }
    return parentElements
  }

  function hover(element, init) {
    if (isLabelWithInternallyDisabledControl(element)) return

    const parentElements = getParentElements(element).reverse();

    dom.fireEvent.pointerOver(element, init);
    for (const el of parentElements) {
      dom.fireEvent.pointerEnter(el, init);
    }
    if (!element.disabled) {
      dom.fireEvent.mouseOver(element, getMouseEventOptions('mouseover', init));
      for (const el of parentElements) {
        dom.fireEvent.mouseEnter(el, getMouseEventOptions('mouseenter', init));
      }
    }
    dom.fireEvent.pointerMove(element, init);
    if (!element.disabled) {
      dom.fireEvent.mouseMove(element, getMouseEventOptions('mousemove', init));
    }
  }

  function unhover(element, init) {
    if (isLabelWithInternallyDisabledControl(element)) return

    const parentElements = getParentElements(element);

    dom.fireEvent.pointerMove(element, init);
    if (!element.disabled) {
      dom.fireEvent.mouseMove(element, getMouseEventOptions('mousemove', init));
    }
    dom.fireEvent.pointerOut(element, init);
    for (const el of parentElements) {
      dom.fireEvent.pointerLeave(el, init);
    }
    if (!element.disabled) {
      dom.fireEvent.mouseOut(element, getMouseEventOptions('mouseout', init));
      for (const el of parentElements) {
        dom.fireEvent.mouseLeave(el, getMouseEventOptions('mouseleave', init));
      }
    }
  }

  function blur(element) {
    if (!isFocusable(element)) return

    const wasActive = getActiveElement(element.ownerDocument) === element;
    if (!wasActive) return

    eventWrapper(() => element.blur());
  }

  function focus(element) {
    if (!isFocusable(element)) return

    const isAlreadyActive = getActiveElement(element.ownerDocument) === element;
    if (isAlreadyActive) return

    eventWrapper(() => element.focus());
  }

  function getPreviouslyFocusedElement(element) {
    const focusedElement = element.ownerDocument.activeElement;
    const wasAnotherElementFocused =
      focusedElement &&
      focusedElement !== element.ownerDocument.body &&
      focusedElement !== element;
    return wasAnotherElementFocused ? focusedElement : null
  }

  function clickLabel(label, init, {clickCount}) {
    if (isLabelWithInternallyDisabledControl(label)) return

    dom.fireEvent.pointerDown(label, init);
    dom.fireEvent.mouseDown(
      label,
      getMouseEventOptions('mousedown', init, clickCount),
    );
    dom.fireEvent.pointerUp(label, init);
    dom.fireEvent.mouseUp(label, getMouseEventOptions('mouseup', init, clickCount));
    dom.fireEvent.click(label, getMouseEventOptions('click', init, clickCount));
    // clicking the label will trigger a click of the label.control
    // however, it will not focus the label.control so we have to do it
    // ourselves.
    if (label.control) focus(label.control);
  }

  function clickBooleanElement(element, init, clickCount) {
    dom.fireEvent.pointerDown(element, init);
    if (!element.disabled) {
      dom.fireEvent.mouseDown(
        element,
        getMouseEventOptions('mousedown', init, clickCount),
      );
    }
    focus(element);
    dom.fireEvent.pointerUp(element, init);
    if (!element.disabled) {
      dom.fireEvent.mouseUp(
        element,
        getMouseEventOptions('mouseup', init, clickCount),
      );
      dom.fireEvent.click(element, getMouseEventOptions('click', init, clickCount));
    }
  }

  function clickElement(element, init, {clickCount}) {
    const previousElement = getPreviouslyFocusedElement(element);
    dom.fireEvent.pointerDown(element, init);
    if (!element.disabled) {
      const continueDefaultHandling = dom.fireEvent.mouseDown(
        element,
        getMouseEventOptions('mousedown', init, clickCount),
      );
      if (
        continueDefaultHandling &&
        element !== element.ownerDocument.activeElement
      ) {
        if (previousElement && !isFocusable(element)) {
          blur(previousElement);
        } else {
          focus(element);
        }
      }
    }
    dom.fireEvent.pointerUp(element, init);
    if (!element.disabled) {
      dom.fireEvent.mouseUp(
        element,
        getMouseEventOptions('mouseup', init, clickCount),
      );
      dom.fireEvent.click(element, getMouseEventOptions('click', init, clickCount));
      const parentLabel = element.closest('label');
      if (parentLabel?.control) focus(parentLabel.control);
    }
  }

  function click(element, init, {skipHover = false, clickCount = 0} = {}) {
    if (!skipHover) hover(element, init);
    switch (element.tagName) {
      case 'LABEL':
        clickLabel(element, init, {clickCount});
        break
      case 'INPUT':
        if (element.type === 'checkbox' || element.type === 'radio') {
          clickBooleanElement(element, init, {clickCount});
        } else {
          clickElement(element, init, {clickCount});
        }
        break
      default:
        clickElement(element, init, {clickCount});
    }
  }

  function dblClick(element, init) {
    hover(element, init);
    click(element, init, {skipHover: true, clickCount: 0});
    click(element, init, {skipHover: true, clickCount: 1});
    dom.fireEvent.dblClick(element, getMouseEventOptions('dblclick', init, 2));
  }

  const keys = {
    ArrowLeft: {
      keyCode: 37,
    },
    ArrowRight: {
      keyCode: 39,
    },
  };

  function getSelectionRange$1(currentElement, key) {
    const {selectionStart, selectionEnd} = currentElement();
    const cursorChange = Number(key in keys) * (key === 'ArrowLeft' ? -1 : 1);
    return {
      selectionStart: selectionStart + cursorChange,
      selectionEnd: selectionEnd + cursorChange,
    }
  }

  function navigationKey(key) {
    const event = {
      key,
      keyCode: keys[key].keyCode,
      which: keys[key].keyCode,
    };

    return ({currentElement, eventOverrides}) => {
      dom.fireEvent.keyDown(currentElement(), {
        ...event,
        ...eventOverrides,
      });

      const range = getSelectionRange$1(currentElement, key);
      setSelectionRangeIfNecessary(
        currentElement(),
        range.selectionStart,
        range.selectionEnd,
      );

      dom.fireEvent.keyUp(currentElement(), {
        ...event,
        ...eventOverrides,
      });
    }
  }

  // TODO: wrap in asyncWrapper

  const modifierCallbackMap = {
    ...createModifierCallbackEntries({
      name: 'shift',
      key: 'Shift',
      keyCode: 16,
      modifierProperty: 'shiftKey',
    }),
    ...createModifierCallbackEntries({
      name: 'ctrl',
      key: 'Control',
      keyCode: 17,
      modifierProperty: 'ctrlKey',
    }),
    ...createModifierCallbackEntries({
      name: 'alt',
      key: 'Alt',
      keyCode: 18,
      modifierProperty: 'altKey',
    }),
    ...createModifierCallbackEntries({
      name: 'meta',
      key: 'Meta',
      keyCode: 93,
      modifierProperty: 'metaKey',
    }),
  };

  const specialCharCallbackMap = {
    '{arrowleft}': navigationKey('ArrowLeft'),
    '{arrowright}': navigationKey('ArrowRight'),
    '{enter}': handleEnter,
    '{esc}': handleEsc,
    '{del}': handleDel,
    '{backspace}': handleBackspace,
    '{selectall}': handleSelectall,
    '{space}': handleSpace,
    ' ': handleSpace,
  };

  function wait(time) {
    return new Promise(resolve => setTimeout(() => resolve(), time))
  }

  // this needs to be wrapped in the event/asyncWrapper for React's act and angular's change detection
  // depending on whether it will be async.
  async function type(element, text, {delay = 0, ...options} = {}) {
    // we do not want to wrap in the asyncWrapper if we're not
    // going to actually be doing anything async, so we only wrap
    // if the delay is greater than 0
    let result;
    if (delay > 0) {
      await dom.getConfig().asyncWrapper(async () => {
        result = await typeImpl(element, text, {delay, ...options});
      });
    } else {
      result = typeImpl(element, text, {delay, ...options});
    }
    return result
  }

  async function typeImpl(
    element,
    text,
    {
      delay,
      skipClick = false,
      skipAutoClose = false,
      initialSelectionStart,
      initialSelectionEnd,
    },
  ) {
    if (element.disabled) return

    if (!skipClick) click(element);

    if (isContentEditable(element) && document.getSelection().rangeCount === 0) {
      const range = document.createRange();
      range.setStart(element, 0);
      range.setEnd(element, 0);
      document.getSelection().addRange(range);
    }
    // The focused element could change between each event, so get the currently active element each time
    const currentElement = () => getActiveElement(element.ownerDocument);

    // by default, a new element has it's selection start and end at 0
    // but most of the time when people call "type", they expect it to type
    // at the end of the current input value. So, if the selection start
    // and end are both the default of 0, then we'll go ahead and change
    // them to the length of the current value.
    // the only time it would make sense to pass the initialSelectionStart or
    // initialSelectionEnd is if you have an input with a value and want to
    // explicitely start typing with the cursor at 0. Not super common.
    const value = getValue(currentElement());

    const {selectionStart, selectionEnd} = getSelectionRange(element);

    if (value != null && selectionStart === 0 && selectionEnd === 0) {
      setSelectionRangeIfNecessary(
        currentElement(),
        initialSelectionStart ?? value.length,
        initialSelectionEnd ?? value.length,
      );
    }

    const eventCallbacks = queueCallbacks();
    await runCallbacks(eventCallbacks);

    function queueCallbacks() {
      const callbacks = [];
      let remainingString = text;

      while (remainingString) {
        const {callback, remainingString: newRemainingString} = getNextCallback(
          remainingString,
          skipAutoClose,
        );
        callbacks.push(callback);
        remainingString = newRemainingString;
      }

      return callbacks
    }

    async function runCallbacks(callbacks) {
      const eventOverrides = {};
      let prevWasMinus, prevWasPeriod, prevValue, typedValue;
      for (const callback of callbacks) {
        if (delay > 0) await wait(delay);
        if (!currentElement().disabled) {
          const returnValue = callback({
            currentElement,
            prevWasMinus,
            prevWasPeriod,
            prevValue,
            eventOverrides,
            typedValue,
          });
          Object.assign(eventOverrides, returnValue?.eventOverrides);
          prevWasMinus = returnValue?.prevWasMinus;
          prevWasPeriod = returnValue?.prevWasPeriod;
          prevValue = returnValue?.prevValue;
          typedValue = returnValue?.typedValue;
        }
      }
    }
  }

  function getNextCallback(remainingString, skipAutoClose) {
    const modifierCallback = getModifierCallback(remainingString, skipAutoClose);
    if (modifierCallback) {
      return modifierCallback
    }

    const specialCharCallback = getSpecialCharCallback(remainingString);
    if (specialCharCallback) {
      return specialCharCallback
    }

    return getTypeCallback(remainingString)
  }

  function getModifierCallback(remainingString, skipAutoClose) {
    const modifierKey = Object.keys(modifierCallbackMap).find(key =>
      remainingString.startsWith(key),
    );
    if (!modifierKey) {
      return null
    }
    const callback = modifierCallbackMap[modifierKey];

    // if this modifier has an associated "close" callback and the developer
    // doesn't close it themselves, then we close it for them automatically
    // Effectively if they send in: '{alt}a' then we type: '{alt}a{/alt}'
    if (
      !skipAutoClose &&
      callback.closeName &&
      !remainingString.includes(callback.closeName)
    ) {
      remainingString += callback.closeName;
    }
    remainingString = remainingString.slice(modifierKey.length);
    return {
      callback,
      remainingString,
    }
  }

  function getSpecialCharCallback(remainingString) {
    const specialChar = Object.keys(specialCharCallbackMap).find(key =>
      remainingString.startsWith(key),
    );
    if (!specialChar) {
      return null
    }
    return {
      callback: specialCharCallbackMap[specialChar],
      remainingString: remainingString.slice(specialChar.length),
    }
  }

  function getTypeCallback(remainingString) {
    const character = remainingString[0];
    const callback = context => typeCharacter(character, context);
    return {
      callback,
      remainingString: remainingString.slice(1),
    }
  }

  function setSelectionRange({currentElement, newValue, newSelectionStart}) {
    // if we *can* change the selection start, then we will if the new value
    // is the same as the current value (so it wasn't programatically changed
    // when the fireEvent.input was triggered).
    // The reason we have to do this at all is because it actually *is*
    // programmatically changed by fireEvent.input, so we have to simulate the
    // browser's default behavior
    const value = getValue(currentElement());

    if (value === newValue) {
      setSelectionRangeIfNecessary(
        currentElement(),
        newSelectionStart,
        newSelectionStart,
      );
    } else {
      // If the currentValue is different than the expected newValue and we *can*
      // change the selection range, than we should set it to the length of the
      // currentValue to ensure that the browser behavior is mimicked.
      setSelectionRangeIfNecessary(currentElement(), value.length, value.length);
    }
  }

  function fireInputEventIfNeeded({
    currentElement,
    newValue,
    newSelectionStart,
    eventOverrides,
  }) {
    const prevValue = getValue(currentElement());
    if (
      !currentElement().readOnly &&
      !isClickable(currentElement()) &&
      newValue !== prevValue
    ) {
      if (isContentEditable(currentElement())) {
        dom.fireEvent.input(currentElement(), {
          target: {textContent: newValue},
          ...eventOverrides,
        });
      } else {
        dom.fireEvent.input(currentElement(), {
          target: {value: newValue},
          ...eventOverrides,
        });
      }

      setSelectionRange({
        currentElement,
        newValue,
        newSelectionStart,
      });
    }

    return {prevValue}
  }

  function typeCharacter(
    char,
    {
      currentElement,
      prevWasMinus = false,
      prevWasPeriod = false,
      prevValue = '',
      typedValue = '',
      eventOverrides,
    },
  ) {
    const key = char; // TODO: check if this also valid for characters with diacritic markers e.g. úé etc
    const keyCode = char.charCodeAt(0);
    let nextPrevWasMinus, nextPrevWasPeriod;
    const textToBeTyped = typedValue + char;
    const keyDownDefaultNotPrevented = dom.fireEvent.keyDown(currentElement(), {
      key,
      keyCode,
      which: keyCode,
      ...eventOverrides,
    });

    if (keyDownDefaultNotPrevented) {
      const keyPressDefaultNotPrevented = dom.fireEvent.keyPress(currentElement(), {
        key,
        keyCode,
        charCode: keyCode,
        ...eventOverrides,
      });
      if (getValue(currentElement()) != null && keyPressDefaultNotPrevented) {
        let newEntry = char;
        if (prevWasMinus) {
          newEntry = `-${char}`;
        } else if (prevWasPeriod) {
          newEntry = `${prevValue}.${char}`;
        }

        if (isValidDateValue(currentElement(), textToBeTyped)) {
          newEntry = textToBeTyped;
        }

        const inputEvent = fireInputEventIfNeeded({
          ...calculateNewValue(newEntry, currentElement()),
          eventOverrides: {
            data: key,
            inputType: 'insertText',
            ...eventOverrides,
          },
          currentElement,
        });
        prevValue = inputEvent.prevValue;

        if (isValidDateValue(currentElement(), textToBeTyped)) {
          dom.fireEvent.change(currentElement(), {target: {value: textToBeTyped}});
        }

        // typing "-" into a number input will not actually update the value
        // so for the next character we type, the value should be set to
        // `-${newEntry}`
        // we also preserve the prevWasMinus when the value is unchanged due
        // to typing an invalid character (typing "-a3" results in "-3")
        // same applies for the decimal character.
        if (currentElement().type === 'number') {
          const newValue = getValue(currentElement());
          if (newValue === prevValue && newEntry !== '-') {
            nextPrevWasMinus = prevWasMinus;
          } else {
            nextPrevWasMinus = newEntry === '-';
          }
          if (newValue === prevValue && newEntry !== '.') {
            nextPrevWasPeriod = prevWasPeriod;
          } else {
            nextPrevWasPeriod = newEntry === '.';
          }
        }
      }
    }

    dom.fireEvent.keyUp(currentElement(), {
      key,
      keyCode,
      which: keyCode,
      ...eventOverrides,
    });

    return {
      prevWasMinus: nextPrevWasMinus,
      prevWasPeriod: nextPrevWasPeriod,
      prevValue,
      typedValue: textToBeTyped,
    }
  }

  // yes, calculateNewBackspaceValue and calculateNewValue look extremely similar
  // and you may be tempted to create a shared abstraction.
  // If you, brave soul, decide to so endevor, please increment this count
  // when you inevitably fail: 1
  function calculateNewBackspaceValue(element) {
    const {selectionStart, selectionEnd} = getSelectionRange(element);
    const value = getValue(element);
    let newValue, newSelectionStart;

    if (selectionStart === null) {
      // at the end of an input type that does not support selection ranges
      // https://github.com/testing-library/user-event/issues/316#issuecomment-639744793
      newValue = value.slice(0, value.length - 1);
      newSelectionStart = selectionStart - 1;
    } else if (selectionStart === selectionEnd) {
      if (selectionStart === 0) {
        // at the beginning of the input
        newValue = value;
        newSelectionStart = selectionStart;
      } else if (selectionStart === value.length) {
        // at the end of the input
        newValue = value.slice(0, value.length - 1);
        newSelectionStart = selectionStart - 1;
      } else {
        // in the middle of the input
        newValue = value.slice(0, selectionStart - 1) + value.slice(selectionEnd);
        newSelectionStart = selectionStart - 1;
      }
    } else {
      // we have something selected
      const firstPart = value.slice(0, selectionStart);
      newValue = firstPart + value.slice(selectionEnd);
      newSelectionStart = firstPart.length;
    }

    return {newValue, newSelectionStart}
  }

  function calculateNewDeleteValue(element) {
    const {selectionStart, selectionEnd} = getSelectionRange(element);
    const value = getValue(element);
    let newValue;

    if (selectionStart === null) {
      // at the end of an input type that does not support selection ranges
      // https://github.com/testing-library/user-event/issues/316#issuecomment-639744793
      newValue = value;
    } else if (selectionStart === selectionEnd) {
      if (selectionStart === 0) {
        // at the beginning of the input
        newValue = value.slice(1);
      } else if (selectionStart === value.length) {
        // at the end of the input
        newValue = value;
      } else {
        // in the middle of the input
        newValue = value.slice(0, selectionStart) + value.slice(selectionEnd + 1);
      }
    } else {
      // we have something selected
      const firstPart = value.slice(0, selectionStart);
      newValue = firstPart + value.slice(selectionEnd);
    }

    return {newValue, newSelectionStart: selectionStart}
  }

  function createModifierCallbackEntries({name, key, keyCode, modifierProperty}) {
    const openName = `{${name}}`;
    const closeName = `{/${name}}`;

    function open({currentElement, eventOverrides}) {
      const newEventOverrides = {[modifierProperty]: true};

      dom.fireEvent.keyDown(currentElement(), {
        key,
        keyCode,
        which: keyCode,
        ...eventOverrides,
        ...newEventOverrides,
      });

      return {eventOverrides: newEventOverrides}
    }
    open.closeName = closeName;
    function close({currentElement, eventOverrides}) {
      const newEventOverrides = {[modifierProperty]: false};

      dom.fireEvent.keyUp(currentElement(), {
        key,
        keyCode,
        which: keyCode,
        ...eventOverrides,
        ...newEventOverrides,
      });

      return {eventOverrides: newEventOverrides}
    }
    return {
      [openName]: open,
      [closeName]: close,
    }
  }

  function handleEnter({currentElement, eventOverrides}) {
    const key = 'Enter';
    const keyCode = 13;

    const keyDownDefaultNotPrevented = dom.fireEvent.keyDown(currentElement(), {
      key,
      keyCode,
      which: keyCode,
      ...eventOverrides,
    });

    if (keyDownDefaultNotPrevented) {
      const keyPressDefaultNotPrevented = dom.fireEvent.keyPress(currentElement(), {
        key,
        keyCode,
        charCode: keyCode,
        ...eventOverrides,
      });

      if (keyPressDefaultNotPrevented) {
        if (isClickable(currentElement())) {
          dom.fireEvent.click(currentElement(), {
            ...eventOverrides,
          });
        }

        if (currentElement().tagName === 'TEXTAREA') {
          const {newValue, newSelectionStart} = calculateNewValue(
            '\n',
            currentElement(),
          );
          dom.fireEvent.input(currentElement(), {
            target: {value: newValue},
            inputType: 'insertLineBreak',
            ...eventOverrides,
          });
          setSelectionRange({
            currentElement,
            newValue,
            newSelectionStart,
          });
        }

        if (
          currentElement().tagName === 'INPUT' &&
          currentElement().form &&
          (currentElement().form.querySelectorAll('input').length === 1 ||
            currentElement().form.querySelector('input[type="submit"]') ||
            currentElement().form.querySelector('button[type="submit"]'))
        ) {
          dom.fireEvent.submit(currentElement().form);
        }
      }
    }

    dom.fireEvent.keyUp(currentElement(), {
      key,
      keyCode,
      which: keyCode,
      ...eventOverrides,
    });
  }

  function handleEsc({currentElement, eventOverrides}) {
    const key = 'Escape';
    const keyCode = 27;

    dom.fireEvent.keyDown(currentElement(), {
      key,
      keyCode,
      which: keyCode,
      ...eventOverrides,
    });

    // NOTE: Browsers do not fire a keypress on meta key presses

    dom.fireEvent.keyUp(currentElement(), {
      key,
      keyCode,
      which: keyCode,
      ...eventOverrides,
    });
  }

  function handleDel({currentElement, eventOverrides}) {
    const key = 'Delete';
    const keyCode = 46;

    const keyPressDefaultNotPrevented = dom.fireEvent.keyDown(currentElement(), {
      key,
      keyCode,
      which: keyCode,
      ...eventOverrides,
    });

    if (keyPressDefaultNotPrevented) {
      fireInputEventIfNeeded({
        ...calculateNewDeleteValue(currentElement()),
        eventOverrides: {
          inputType: 'deleteContentForward',
          ...eventOverrides,
        },
        currentElement,
      });
    }

    dom.fireEvent.keyUp(currentElement(), {
      key,
      keyCode,
      which: keyCode,
      ...eventOverrides,
    });
  }

  function handleBackspace({currentElement, eventOverrides}) {
    const key = 'Backspace';
    const keyCode = 8;

    const keyPressDefaultNotPrevented = dom.fireEvent.keyDown(currentElement(), {
      key,
      keyCode,
      which: keyCode,
      ...eventOverrides,
    });

    if (keyPressDefaultNotPrevented) {
      fireInputEventIfNeeded({
        ...calculateNewBackspaceValue(currentElement()),
        eventOverrides: {
          inputType: 'deleteContentBackward',
          ...eventOverrides,
        },
        currentElement,
      });
    }

    dom.fireEvent.keyUp(currentElement(), {
      key,
      keyCode,
      which: keyCode,
      ...eventOverrides,
    });
  }

  function handleSelectall({currentElement}) {
    currentElement().setSelectionRange(0, getValue(currentElement()).length);
  }

  function handleSpace(context) {
    if (isClickable(context.currentElement())) {
      handleSpaceOnClickable(context);
      return
    }
    typeCharacter(' ', context);
  }

  function handleSpaceOnClickable({currentElement, eventOverrides}) {
    const key = ' ';
    const keyCode = 32;

    const keyDownDefaultNotPrevented = dom.fireEvent.keyDown(currentElement(), {
      key,
      keyCode,
      which: keyCode,
      ...eventOverrides,
    });

    if (keyDownDefaultNotPrevented) {
      dom.fireEvent.keyPress(currentElement(), {
        key,
        keyCode,
        charCode: keyCode,
        ...eventOverrides,
      });
    }

    const keyUpDefaultNotPrevented = dom.fireEvent.keyUp(currentElement(), {
      key,
      keyCode,
      which: keyCode,
      ...eventOverrides,
    });

    if (keyDownDefaultNotPrevented && keyUpDefaultNotPrevented) {
      dom.fireEvent.click(currentElement(), {
        ...eventOverrides,
      });
    }
  }

  function clear(element) {
    if (element.tagName !== 'INPUT' && element.tagName !== 'TEXTAREA') {
      // TODO: support contenteditable
      throw new Error(
        'clear currently only supports input and textarea elements.',
      )
    }

    if (element.disabled) return
    // TODO: track the selection range ourselves so we don't have to do this input "type" trickery
    // just like cypress does: https://github.com/cypress-io/cypress/blob/8d7f1a0bedc3c45a2ebf1ff50324b34129fdc683/packages/driver/src/dom/selection.ts#L16-L37
    const elementType = element.type;
    // type is a readonly property on textarea, so check if element is an input before trying to modify it
    if (element.tagName === 'INPUT') {
      // setSelectionRange is not supported on certain types of inputs, e.g. "number" or "email"
      element.type = 'text';
    }
    type(element, '{selectall}{del}', {
      delay: 0,
      initialSelectionStart: element.selectionStart,
      initialSelectionEnd: element.selectionEnd,
    });
    if (element.tagName === 'INPUT') {
      element.type = elementType;
    }
  }

  function getNextElement(currentIndex, shift, elements, focusTrap) {
    if (focusTrap === document && currentIndex === 0 && shift) {
      return document.body
    } else if (
      focusTrap === document &&
      currentIndex === elements.length - 1 &&
      !shift
    ) {
      return document.body
    } else {
      const nextIndex = shift ? currentIndex - 1 : currentIndex + 1;
      const defaultIndex = shift ? elements.length - 1 : 0;
      return elements[nextIndex] || elements[defaultIndex]
    }
  }

  function tab({shift = false, focusTrap} = {}) {
    const previousElement = getActiveElement(focusTrap?.ownerDocument ?? document);

    if (!focusTrap) {
      focusTrap = document;
    }

    const focusableElements = focusTrap.querySelectorAll(FOCUSABLE_SELECTOR);

    const enabledElements = [...focusableElements].filter(
      el =>
        el === previousElement ||
        (el.getAttribute('tabindex') !== '-1' && !el.disabled),
    );

    if (enabledElements.length === 0) return

    const orderedElements = enabledElements
      .map((el, idx) => ({el, idx}))
      .sort((a, b) => {
        // tabindex has no effect if the active element has tabindex="-1"
        if (
          previousElement &&
          previousElement.getAttribute('tabindex') === '-1'
        ) {
          return a.idx - b.idx
        }

        const tabIndexA = a.el.getAttribute('tabindex');
        const tabIndexB = b.el.getAttribute('tabindex');

        const diff = tabIndexA - tabIndexB;

        return diff === 0 ? a.idx - b.idx : diff
      })
      .map(({el}) => el);

    const checkedRadio = {};
    let prunedElements = [];
    orderedElements.forEach(el => {
      // For radio groups keep only the active radio
      // If there is no active radio, keep only the checked radio
      // If there is no checked radio, treat like everything else
      if (el.type === 'radio' && el.name) {
        // If the active element is part of the group, add only that
        if (
          previousElement &&
          previousElement.type === el.type &&
          previousElement.name === el.name
        ) {
          if (el === previousElement) {
            prunedElements.push(el);
          }
          return
        }

        // If we stumble upon a checked radio, remove the others
        if (el.checked) {
          prunedElements = prunedElements.filter(
            e => e.type !== el.type || e.name !== el.name,
          );
          prunedElements.push(el);
          checkedRadio[el.name] = el;
          return
        }

        // If we already found the checked one, skip
        if (checkedRadio[el.name]) {
          return
        }
      }

      prunedElements.push(el);
    });

    const index = prunedElements.findIndex(el => el === previousElement);
    const nextElement = getNextElement(index, shift, prunedElements, focusTrap);

    const shiftKeyInit = {
      key: 'Shift',
      keyCode: 16,
      shiftKey: true,
    };
    const tabKeyInit = {
      key: 'Tab',
      keyCode: 9,
      shiftKey: shift,
    };

    let continueToTab = true;

    // not sure how to make it so there's no previous element...
    // istanbul ignore else
    if (previousElement) {
      // preventDefault on the shift key makes no difference
      if (shift) dom.fireEvent.keyDown(previousElement, {...shiftKeyInit});
      continueToTab = dom.fireEvent.keyDown(previousElement, {...tabKeyInit});
    }

    const keyUpTarget =
      !continueToTab && previousElement ? previousElement : nextElement;

    if (continueToTab) {
      if (nextElement === document.body) {
        blur(previousElement);
      } else {
        focus(nextElement);
      }
    }

    dom.fireEvent.keyUp(keyUpTarget, {...tabKeyInit});

    if (shift) {
      dom.fireEvent.keyUp(keyUpTarget, {...shiftKeyInit, shiftKey: false});
    }
  }

  /*
  eslint
    complexity: "off",
    max-statements: "off",
  */

  function upload(element, fileOrFiles, init) {
    if (element.disabled) return

    let files;
    let input = element;

    click(element, init);
    if (element.tagName === 'LABEL') {
      files = element.control.multiple ? fileOrFiles : [fileOrFiles];
      input = element.control;
    } else {
      files = element.multiple ? fileOrFiles : [fileOrFiles];
    }

    // blur fires when the file selector pops up
    blur(element);
    // focus fires when they make their selection
    focus(element);

    // the event fired in the browser isn't actually an "input" or "change" event
    // but a new Event with a type set to "input" and "change"
    // Kinda odd...
    const inputFiles = {
      length: files.length,
      item: index => files[index],
      ...files,
    };

    dom.fireEvent(
      input,
      dom.createEvent('input', input, {
        target: {files: inputFiles},
        bubbles: true,
        cancelable: false,
        composed: true,
        ...init,
      }),
    );

    dom.fireEvent.change(input, {
      target: {files: inputFiles},
      ...init,
    });
  }

  function selectOptionsBase(newValue, select, values, init) {
    if (!newValue && !select.multiple) {
      throw dom.getConfig().getElementError(
        `Unable to deselect an option in a non-multiple select. Use selectOptions to change the selection instead.`,
        select,
      )
    }
    const valArray = Array.isArray(values) ? values : [values];
    const allOptions = Array.from(
      select.querySelectorAll('option, [role="option"]'),
    );
    const selectedOptions = valArray
      .map(val => {
        if (allOptions.includes(val)) {
          return val
        } else {
          const matchingOption = allOptions.find(
            o => o.value === val || o.innerHTML === val,
          );
          if (matchingOption) {
            return matchingOption
          } else {
            throw dom.getConfig().getElementError(
              `Value "${val}" not found in options`,
              select,
            )
          }
        }
      })
      .filter(option => !option.disabled);

    if (select.disabled || !selectedOptions.length) return

    if (select.multiple) {
      for (const option of selectedOptions) {
        // events fired for multiple select are weird. Can't use hover...
        dom.fireEvent.pointerOver(option, init);
        dom.fireEvent.pointerEnter(select, init);
        dom.fireEvent.mouseOver(option);
        dom.fireEvent.mouseEnter(select);
        dom.fireEvent.pointerMove(option, init);
        dom.fireEvent.mouseMove(option, init);
        dom.fireEvent.pointerDown(option, init);
        dom.fireEvent.mouseDown(option, init);
        focus(select);
        dom.fireEvent.pointerUp(option, init);
        dom.fireEvent.mouseUp(option, init);
        selectOption(option);
        dom.fireEvent.click(option, init);
      }
    } else if (selectedOptions.length === 1) {
      click(select, init);
      selectOption(selectedOptions[0]);
    } else {
      throw dom.getConfig().getElementError(
        `Cannot select multiple options on a non-multiple select`,
        select,
      )
    }

    function selectOption(option) {
      if (option.getAttribute('role') === 'option') {
        option?.setAttribute?.('aria-selected', newValue);

        hover(option, init);
        click(option, init);
        unhover(option, init);
      } else {
        option.selected = newValue;
        dom.fireEvent(
          select,
          dom.createEvent('input', select, {
            bubbles: true,
            cancelable: false,
            composed: true,
            ...init,
          }),
        );
        dom.fireEvent.change(select, init);
      }
    }
  }

  const selectOptions = selectOptionsBase.bind(null, true);
  const deselectOptions = selectOptionsBase.bind(null, false);

  function paste(
    element,
    text,
    init,
    {initialSelectionStart, initialSelectionEnd} = {},
  ) {
    if (element.disabled) return
    if (typeof element.value === 'undefined') {
      throw new TypeError(
        `the current element is of type ${element.tagName} and doesn't have a valid value`,
      )
    }
    eventWrapper(() => element.focus());

    // by default, a new element has it's selection start and end at 0
    // but most of the time when people call "paste", they expect it to paste
    // at the end of the current input value. So, if the selection start
    // and end are both the default of 0, then we'll go ahead and change
    // them to the length of the current value.
    // the only time it would make sense to pass the initialSelectionStart or
    // initialSelectionEnd is if you have an input with a value and want to
    // explicitely start typing with the cursor at 0. Not super common.
    if (element.selectionStart === 0 && element.selectionEnd === 0) {
      setSelectionRangeIfNecessary(
        element,
        initialSelectionStart ?? element.value.length,
        initialSelectionEnd ?? element.value.length,
      );
    }

    dom.fireEvent.paste(element, init);

    if (!element.readOnly) {
      const {newValue, newSelectionStart} = calculateNewValue(text, element);
      dom.fireEvent.input(element, {
        inputType: 'insertFromPaste',
        target: {value: newValue},
      });
      setSelectionRangeIfNecessary(element, {
        newSelectionStart,
        newSelectionEnd: newSelectionStart,
      });
    }
  }

  const userEvent = {
    click,
    dblClick,
    type,
    clear,
    tab,
    hover,
    unhover,
    upload,
    selectOptions,
    deselectOptions,
    paste,
  };

  return userEvent;

})));
