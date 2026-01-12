"use strict";

var Line = require("./line");
var isNumber = require("./helpers").isNumber;
var pack = require("./helpers").pack;
var offsetVector = require("./helpers").offsetVector;
var DocumentContext = require("./documentContext");
const rtlUtils = require("./rtlUtils");

/**
 * Creates an instance of ElementWriter - a line/vector writer, which adds
 * elements to current page and sets their positions based on the context
 */
function ElementWriter(context, tracker) {
	this.context = context;
	this.contextStack = [];
	this.tracker = tracker;
}

function addPageItem(page, item, index) {
	if (
		index === null ||
		index === undefined ||
		index < 0 ||
		index > page.items.length
	) {
		page.items.push(item);
	} else {
		page.items.splice(index, 0, item);
	}
}

ElementWriter.prototype.addLine = function (
	line,
	dontUpdateContextPosition,
	index
) {
	var height = line.getHeight();
	var context = this.context;
	var page = context.getCurrentPage(),
		position = this.getCurrentPositionOnPage();

	if (context.availableHeight < height || !page) {
		return false;
	}

	line.x = context.x + (line.x || 0);
	line.y = context.y + (line.y || 0);

	this.alignLine(line);

	addPageItem(
		page,
		{
			type: "line",
			item: line,
		},
		index
	);
	this.tracker.emit("lineAdded", line);

	if (!dontUpdateContextPosition) {
		context.moveDown(height);
	}

	return position;
};

ElementWriter.prototype.alignLine = function (line) {
	var width = this.context.availableWidth;
	var lineWidth = line.getWidth();

	var alignment =
		line.inlines && line.inlines.length > 0 && line.inlines[0].alignment;
	var isRTL = line.isRTL && line.isRTL();

	var offset = 0;

	var ltrMixed = !isRTL && line.inlines.some(x => rtlUtils.containsRTL(x.text));

	// For RTL lines, we need special handling
	if (isRTL) {
		// If it's RTL and no explicit alignment, default to right
		if (!alignment || alignment === "left") {
			alignment = "right";
		}

		// For RTL, we need to reverse the order of inlines and adjust their positions
		this.adjustRTLInlines(line, width);
	} else if (ltrMixed) {
		if (!alignment || alignment === "right")
			alignment = "left";

		otoAdjustLtrMixedInline(line, width);
	}

	switch (alignment) {
		case "right":
			offset = width - lineWidth;
			break;
		case "center":
			offset = (width - lineWidth) / 2;
			break;
	}

	if (offset) {
		line.x = (line.x || 0) + offset;
	}

	if (
		alignment === "justify" &&
		!line.newLineForced &&
		!line.lastLineInParagraph &&
		line.inlines.length > 1
	) {
		var additionalSpacing = (width - lineWidth) / (line.inlines.length - 1);

		for (var i = 1, l = line.inlines.length; i < l; i++) {
			offset = i * additionalSpacing;

			line.inlines[i].x += offset;
			line.inlines[i].justifyShift = additionalSpacing;
		}
	}
};

ElementWriter.prototype.addImage = function (image, index, type) {
	var context = this.context;
	var page = context.getCurrentPage(),
		position = this.getCurrentPositionOnPage();

	if (
		!page ||
		(image.absolutePosition === undefined &&
			context.availableHeight < image._height &&
			page.items.length > 0)
	) {
		return false;
	}

	if (image._x === undefined) {
		image._x = image.x || 0;
	}

	image.x = context.x + image._x;
	image.y = context.y;

	this.alignImage(image);

	addPageItem(
		page,
		{
			type: type || "image",
			item: image,
		},
		index
	);

	context.moveDown(image._height);

	return position;
};

ElementWriter.prototype.addSVG = function (image, index) {
	return this.addImage(image, index, "svg");
};

ElementWriter.prototype.addQr = function (qr, index) {
	var context = this.context;
	var page = context.getCurrentPage(),
		position = this.getCurrentPositionOnPage();

	if (
		!page ||
		(qr.absolutePosition === undefined && context.availableHeight < qr._height)
	) {
		return false;
	}

	if (qr._x === undefined) {
		qr._x = qr.x || 0;
	}

	qr.x = context.x + qr._x;
	qr.y = context.y;

	this.alignImage(qr);

	for (var i = 0, l = qr._canvas.length; i < l; i++) {
		var vector = qr._canvas[i];
		vector.x += qr.x;
		vector.y += qr.y;
		this.addVector(vector, true, true, index);
	}

	context.moveDown(qr._height);

	return position;
};

ElementWriter.prototype.alignImage = function (image) {
	var width = this.context.availableWidth;
	var imageWidth = image._minWidth;
	var offset = 0;
	switch (image._alignment) {
		case "right":
			offset = width - imageWidth;
			break;
		case "center":
			offset = (width - imageWidth) / 2;
			break;
	}

	if (offset) {
		image.x = (image.x || 0) + offset;
	}
};

ElementWriter.prototype.alignCanvas = function (node) {
	var width = this.context.availableWidth;
	var canvasWidth = node._minWidth;
	var offset = 0;
	switch (node._alignment) {
		case "right":
			offset = width - canvasWidth;
			break;
		case "center":
			offset = (width - canvasWidth) / 2;
			break;
	}
	if (offset) {
		node.canvas.forEach(function (vector) {
			offsetVector(vector, offset, 0);
		});
	}
};

ElementWriter.prototype.addVector = function (
	vector,
	ignoreContextX,
	ignoreContextY,
	index,
	forcePage
) {
	var context = this.context;
	var page = context.getCurrentPage();
	if (isNumber(forcePage)) {
		page = context.pages[forcePage];
	}
	var position = this.getCurrentPositionOnPage();

	if (page) {
		offsetVector(
			vector,
			ignoreContextX ? 0 : context.x,
			ignoreContextY ? 0 : context.y
		);
		addPageItem(
			page,
			{
				type: "vector",
				item: vector,
			},
			index
		);
		return position;
	}
};

ElementWriter.prototype.beginClip = function (width, height) {
	var ctx = this.context;
	var page = ctx.getCurrentPage();
	page.items.push({
		type: "beginClip",
		item: { x: ctx.x, y: ctx.y, width: width, height: height },
	});
	return true;
};

ElementWriter.prototype.endClip = function () {
	var ctx = this.context;
	var page = ctx.getCurrentPage();
	page.items.push({
		type: "endClip",
	});
	return true;
};

/**
 * Adjust RTL inline positioning
 * @param {Line} line - Line containing RTL text
 * @param {number} availableWidth - Available width for the line
 */
ElementWriter.prototype.adjustRTLInlines = function (line, availableWidth) {
	if (!line.inlines || line.inlines.length === 0) {
		return;
	}

	otoAdjustRtlInlines(line, availableWidth);

	return;

	// For RTL text, we need to reverse the visual order of inlines
	// and recalculate their positions from right to left
	var rtlInlines = [];
	var ltrInlines = [];

	// Separate RTL, LTR, and neutral inlines
	line.inlines.forEach(function (inline) {
		var hasNumbers = /\d/.test(inline.text);
		var hasSpecialChars = /[-+*\/=<>()[\]{}.,;:!?'"@#$%^&_~`|\\]/.test(
			inline.text
		);
		var isNeutralContent = hasNumbers || hasSpecialChars;
		if (inline.isRTL || inline.direction !== "ltr" || isNeutralContent) {
			rtlInlines.push(inline);
		} else if (inline.direction === "ltr") {
			ltrInlines.push(inline);
		}
	});

	// If we have RTL inlines, reverse their order and recalculate positions
	if (rtlInlines.length > 0) {
		rtlInlines.reverse();

		// Recalculate x positions from right to left
		var currentX = 0;
		var reorderedInlines = [];

		// Add LTR inlines first (if any)
		ltrInlines.forEach(function (inline) {
			inline.x = currentX;
			currentX += inline.width;
			reorderedInlines.push(inline);
		});

		// Add RTL inlines (already reversed)
		rtlInlines.forEach(function (inline) {
			inline.text = rtlUtils.fixArabicTextUsingReplace(inline.text);
			inline.x = currentX;
			currentX += inline.width;
			reorderedInlines.push(inline);
		});

		// Replace the line's inlines with the reordered ones
		line.inlines = reorderedInlines;
	}
};

function otoAdjustRtlInlines(line, availableWidth) {

	line.inlines = adjustLtrGroup(line.inlines);

	const grouped = groupInlines(line.inlines);

	let reversed = grouped.reverse();
	let reversedInlines = reversed.flat();

	let posX = line.inlines[0].x;

	reversedInlines.map((inline) => {
		inline.x = posX;
		posX += inline.width;
		if (inline.direction === "rtl") {
			inline.text = rtlUtils.fixArabicTextUsingReplace(inline.text);
			inline.text = fixRtlArabicEndWithSpecialCharacter(inline.text);
		}
		return inline;
	});

	line.inlines = reversedInlines;
}

function otoAdjustLtrMixedInline(line, availableWidth) {
  const result = [];
  let buffer = [];

  // remap rtl
  line.inlines.map(x => {
	if (rtlUtils.containsRTL(x.text)) {
		x.direction = 'rtl';
		x.isRTL = true;
	}
  });

	line.inlines = adjustRtlGroup(line.inlines);

  for (const item of line.inlines) {
    if (item.direction === "rtl") {
      buffer.push(item);
    } else {
      if (buffer.length) {
        result.push(...buffer.reverse());
        buffer = [];
      }
      result.push(item);
    }
  }


  if (buffer.length) {
    result.push(...buffer.reverse());
  }

	let posX = line.inlines[0].x;

	result.map((inline) => {
		inline.x = posX;
		posX += inline.width;
		if (inline.direction === "rtl") {
			inline.text = rtlUtils.fixArabicTextUsingReplace(inline.text);
		}
		return inline;
	});

  line.inlines = result;
}

function adjustLtrGroup(arr) {
  const specialChars = /[!@#$%^&*_({[<,.?|\/-]$/;

  // crude width estimate: assume each char ~4 units wide
  function charWidth(ch) {
    return 4.0;
  }

  // Step 1: Group consecutive items by direction
  let grouped = [];
  let currentGroup = null;

  for (let item of arr) {
    if (!currentGroup || currentGroup.direction !== item.direction) {
      currentGroup = {
        direction: item.direction,
        isRTL: item.isRTL,
        items: []
      };
      grouped.push(currentGroup);
    }
    currentGroup.items.push(item);
  }

  // Step 2: Adjust LTR groups if last char is special and next group is RTL
  for (let i = 0; i < grouped.length - 1; i++) {
    const group = grouped[i];
    const nextGroup = grouped[i + 1];

    if (group.direction === "ltr" && nextGroup.direction === "rtl") {
      let lastItem = group.items[group.items.length - 1];
      let trimmed = lastItem.text.trim();
      let lastChar = trimmed.slice(-1);

      if (specialChars.test(lastChar)) {
      	const w = charWidth(lastChar);
        // Remove special char from last item
        lastItem.text = ' ' + trimmed.slice(0, -1);
		lastItem.width -= w;

        // Prepend special char to first item of LTR group
        group.items[0].text = lastChar + group.items[0].text.trim();
		group.items[0].width += w;
      }
    }
  }

  // Step 3: Flatten back into array
  return grouped.flatMap(g => g.items);
}

function adjustRtlGroup(arr) {
  const specialChars = /[!@#$%^&*_({[<,.?|\/-]$/;

  // crude width estimate: assume each char ~4 units wide
  function charWidth(ch) {
    return 4.0;
  }

  // Step 1: Group consecutive items by direction
  let grouped = [];
  let currentGroup = null;

  for (let item of arr) {
    if (!currentGroup || currentGroup.direction !== item.direction) {
      currentGroup = {
        direction: item.direction,
        isRTL: item.isRTL,
        items: []
      };
      grouped.push(currentGroup);
    }
    currentGroup.items.push(item);
  }

  // Step 2: Adjust LTR groups if last char is special and next group is RTL
  for (let i = 0; i < grouped.length - 1; i++) {
    const group = grouped[i];
    const nextGroup = grouped[i + 1];

    if (group.direction === "rtl" && nextGroup.direction === "ltr") {
      let lastItem = group.items[group.items.length - 1];
      let trimmed = lastItem.text.trim();
      let lastChar = trimmed.slice(-1);

      if (specialChars.test(lastChar)) {
      	const w = charWidth(lastChar);
        // Remove special char from last item
        lastItem.text = ' ' + trimmed.slice(0, -1);
		lastItem.width -= w;

        // Prepend special char to first item of LTR group
        group.items[0].text = lastChar + group.items[0].text.trim();
		group.items[0].width += w;
      }
    }
  }

  // Step 3: Flatten back into array
  return grouped.flatMap(g => g.items);
}

const OPEN = ['[', '(', '{', '<'];
const CLOSE = [']', ')', '}', '>'];

function isOpeningBracket(ch) {
  return OPEN.includes(ch);
}
function isClosingBracket(ch) {
  return CLOSE.includes(ch);
}
function startsWithBracket(text) {
  const first = text.trim().charAt(0);
  return isOpeningBracket(first);
}
function endsWithBracket(text) {
  const last = text.trim().slice(-1);
  return isClosingBracket(last);
}

function splitLtrRunByBrackets(run) {
  const groups = [];
  let current = [];

  for (const item of run) {
    const t = item.text;

    // opening starts a (possibly new) bracket group
    if (startsWithBracket(t)) {
      if (current.length) {
        groups.push(current);
        current = [];
      }
      current.push(item);

      // if the same token also ends with the closing bracket, close immediately
      if (endsWithBracket(t)) {
        groups.push(current);
        current = [];
      }
    } else if (endsWithBracket(t)) {
      // closing ends the current bracket group
      current.push(item);
      groups.push(current);
      current = [];
    } else {
      // plain text, accumulate
      current.push(item);
    }
  }

  if (current.length) groups.push(current);
  return groups;
}

function groupInlines(inlines) {
  const groups = [];
  let currentLTRRun = [];

  const flushLTRRun = () => {
    if (!currentLTRRun.length) return;

    const firstChar = currentLTRRun[0].text.trim().charAt(0);
    if (isOpeningBracket(firstChar)) {
      const ltrGroups = splitLtrRunByBrackets(currentLTRRun);
      groups.push(...ltrGroups);
    } else {
      groups.push(currentLTRRun);
    }
    currentLTRRun = [];
  };

  for (const item of inlines) {
    if (item.direction === "ltr") {
      currentLTRRun.push(item);
    } else {
      flushLTRRun();
      groups.push([item]); // RTL single
    }
  }
  flushLTRRun();

  return groups;
}

function fixRtlArabicEndWithSpecialCharacter(text) {
	// remove whitespace before a trailing special character 
	return text.replace(/\s+([\/\\\-\p{P}\p{S}]+)\s*$/u, "$1 ");
}

function cloneLine(line) {
	var result = new Line(line.maxWidth);

	for (var key in line) {
		if (line.hasOwnProperty(key)) {
			result[key] = line[key];
		}
	}

	return result;
}

ElementWriter.prototype.addFragment = function (
	block,
	useBlockXOffset,
	useBlockYOffset,
	dontUpdateContextPosition
) {
	var ctx = this.context;
	var page = ctx.getCurrentPage();

	if (!useBlockXOffset && block.height > ctx.availableHeight) {
		return false;
	}

	block.items.forEach(function (item) {
		switch (item.type) {
			case "line":
				var l = cloneLine(item.item);

				if (l._node) {
					l._node.positions[0].pageNumber = ctx.page + 1;
				}
				l.x = (l.x || 0) + (useBlockXOffset ? block.xOffset || 0 : ctx.x);
				l.y = (l.y || 0) + (useBlockYOffset ? block.yOffset || 0 : ctx.y);

				page.items.push({
					type: "line",
					item: l,
				});
				break;

			case "vector":
				var v = pack(item.item);

				offsetVector(
					v,
					useBlockXOffset ? block.xOffset || 0 : ctx.x,
					useBlockYOffset ? block.yOffset || 0 : ctx.y
				);
				if (v._isFillColorFromUnbreakable) {
					// If the item is a fillColor from an unbreakable block
					// We have to add it at the beginning of the items body array of the page
					delete v._isFillColorFromUnbreakable;
					const endOfBackgroundItemsIndex = ctx.backgroundLength[ctx.page];
					page.items.splice(endOfBackgroundItemsIndex, 0, {
						type: "vector",
						item: v,
					});
				} else {
					page.items.push({
						type: "vector",
						item: v,
					});
				}
				break;

			case "image":
			case "svg":
				var img = pack(item.item);

				img.x = (img.x || 0) + (useBlockXOffset ? block.xOffset || 0 : ctx.x);
				img.y = (img.y || 0) + (useBlockYOffset ? block.yOffset || 0 : ctx.y);

				page.items.push({
					type: item.type,
					item: img,
				});
				break;
		}
	});

	if (!dontUpdateContextPosition) {
		ctx.moveDown(block.height);
	}

	return true;
};

/**
 * Pushes the provided context onto the stack or creates a new one
 *
 * pushContext(context) - pushes the provided context and makes it current
 * pushContext(width, height) - creates and pushes a new context with the specified width and height
 * pushContext() - creates a new context for unbreakable blocks (with current availableWidth and full-page-height)
 */
ElementWriter.prototype.pushContext = function (contextOrWidth, height) {
	if (contextOrWidth === undefined) {
		height =
			this.context.getCurrentPage().height -
			this.context.pageMargins.top -
			this.context.pageMargins.bottom;
		contextOrWidth = this.context.availableWidth;
	}

	if (isNumber(contextOrWidth)) {
		contextOrWidth = new DocumentContext(
			{ width: contextOrWidth, height: height },
			{ left: 0, right: 0, top: 0, bottom: 0 }
		);
	}

	this.contextStack.push(this.context);
	this.context = contextOrWidth;
};

ElementWriter.prototype.popContext = function () {
	this.context = this.contextStack.pop();
};

ElementWriter.prototype.getCurrentPositionOnPage = function () {
	return (this.contextStack[0] || this.context).getCurrentPosition();
};

module.exports = ElementWriter;
