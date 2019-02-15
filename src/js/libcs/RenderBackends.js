// JSHint doesn't like setters without getters, but we use them anyway

/*jshint -W078 */

// SVG Writer creates a string representation, as opposed to DOM manipulation.

function SvgWriterContext() {
    this._path = [];
    this._defs = ['<defs>'];
    this._imgcache = [];
    this._body = [];
    this._saveStack = [''];
    this._clipIndex = 0;
    this._fill = '#000';
    this._stroke = '#000';
    this._fillOpacity = null;
    this._strokeOpacity = null;

    this.width = 0;
    this.height = 0;
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.miterLimit = 10;
    this.globalAlpha = 1;
}

SvgWriterContext.prototype = {

    set fillStyle(style) {
        var self = this;
        parseColor(style, function(r, g, b, a) {
            self._fill = '#' +
                padStr(r.toString(16), 2) +
                padStr(g.toString(16), 2) +
                padStr(b.toString(16), 2);
            self._fillOpacity = (a === 255 ? null : a);
        });
    },

    set strokeStyle(style) {
        var self = this;
        parseColor(style, function(r, g, b, a) {
            self._stroke = '#' +
                padStr(r.toString(16), 2) +
                padStr(g.toString(16), 2) +
                padStr(b.toString(16), 2);
            self._strokeOpacity = (a === 255 ? null : a);
        });
    },

    clearRect: function() {
        // Presumably this just clears everything in an already empty state.
        // But we already might have some transformations applied.
        // So let's just ignore this for now.
    },

    beginPath: function() {
        this._path = [];
    },

    _pathcmd: function() {
        this._path.push.apply(this._path, arguments);
    },

    closePath: function() {
        this._pathcmd('Z');
    },

    moveTo: function(x, y) {
        this._pathcmd('M', x, y);
    },

    lineTo: function(x, y) {
        this._pathcmd('L', x, y);
    },

    bezierCurveTo: function(x1, y1, x2, y2, x3, y3) {
        this._pathcmd('C', x1, y1, x2, y2, x3, y3);
    },

    quadraticCurveTo: function(x1, y1, x2, y2) {
        this._pathcmd('Q', x1, y1, x2, y2);
    },

    arc: function(x, y, r, a1, a2, dir) {
        var x1 = r * Math.cos(a1) + x;
        var y1 = r * Math.sin(a1) + y;
        var x2 = r * Math.cos(a2) + x;
        var y2 = r * Math.sin(a2) + y;
        var covered = dir ? a1 - a2 : a2 - a1;
        if (covered >= 2 * Math.PI) {
            // draw in two arcs since the endpoints of a single arc
            // must not coincide as they would in this case
            this._pathcmd(
                this._path.length ? 'L' : 'M', x1, y1,
                'A', r, r, 0, 0, dir ? 1 : 0,
                x - r * Math.cos(a1), y - r * Math.sin(a1),
                'A', r, r, 0, 0, dir ? 1 : 0, x1, y1);
        } else {
            var largeArc = covered > Math.PI ? 1 : 0;
            this._pathcmd(
                this._path.length ? 'L' : 'M', x1, y1,
                'A', r, r, 0, largeArc, dir ? 1 : 0, x2, y2);
        }
    },

    rect: function(x, y, w, h) {
        this._pathcmd('M', x, y, 'h', w, 'v', h, 'h', -w, 'z');
    },

    _cmd: function(op) {
        if (this.globalAlpha !== 1) {
            this._body.push('<g opacity="' + this.globalAlpha + '">');
            this._body.push(op);
            this._body.push('</g>');
        } else {
            this._body.push(op);
        }
    },

    _attrs: function(dict) {
        var res = '';
        for (var key in dict)
            if (dict[key] !== null)
                res += ' ' + key + '="' + dict[key] + '"';
        return res;
    },

    fill: function() {
        this._cmd('<path' + this._attrs({
            d: this._path.join(' '),
            fill: this._fill,
            'fill-opacity': this._fillOpacity,
        }) + '/>');
    },

    stroke: function() {
        this._cmd('<path' + this._attrs({
            d: this._path.join(' '),
            stroke: this._stroke,
            'stroke-opacity': this._strokeOpacity,
            'stroke-width': this.lineWidth,
            'stroke-linecap': this.lineCap,
            'stroke-linejoin': this.lineJoin,
            'stroke-miterlimit': (
                this.lineJoin === 'miter' ? this.miterLimit : null),
        }) + '/>');
    },

    clip: function() {
        ++this._clipIndex;
        this._body.push(
            '<clipPath id="clip' + this._clipIndex + '">' +
            '<path d="' + this._path.join(' ') + '"/>' +
            '</clipPath>',
            '<g clip-path="url(#clip' + this._clipIndex + ')">'
        );
        this._saveStack[this._saveStack.length - 1] += '</g>';
    },

    save: function() {
        this._saveStack.push('');
    },

    restore: function() {
        this._body.push(this._saveStack.pop());
        if (this._saveStack.length === 0)
            this._saveStack.push('');
    },

    _transform: function(tr) {
        this._body.push('<g transform="' + tr + '">');
        this._saveStack[this._saveStack.length - 1] += '</g>';
    },

    translate: function(x, y) {
        this._transform('translate(' + x + ' ' + y + ')');
    },

    rotate: function(rad) {
        this._transform('rotate(' + rad * (Math.PI / 180) + ')');
    },

    scale: function(x, y) {
        this._transform('scale(' + x + ' ' + y + ')');
    },

    transform: function(a, b, c, d, e, f) {
        this._transform('matrix(' + [a, b, c, d, e, f].join(' ') + ')');
    },
    
    measureText: function(txt) {
      return {
          width: 8*txt.length,
      };
    },

    drawImage: function(img, x, y) {
        if (arguments.length !== 3)
            throw Error('SvgWriterContext only supports ' +
                '3-argument version of drawImage');
        var idx = this._imgcache.indexOf(img);
        if (idx === -1) {
            idx = this._imgcache.length;
            var data;
            if (img.cachedDataURL) {
                data = img.cachedDataURL;
            } else {
                data = imageToDataURL(img);
                // Don't add as img.cachedDataURL since it might be
                // e.g. a video source, which we'd want to re-convert
            }
            this._defs.push(
                '<image id="img' + idx + '" x="0" y="0" width="' + img.width +
                '" height="' + img.height + '" xlink:href="' + data + '"/>');
            this._imgcache.push(img);
        }
        this._cmd(
            '<use x="' + x + '" y="' + y + '" xlink:href="#img' + idx + '"/>');
    },

    toBlob: function() {
        while (this._saveStack.length > 1 || this._saveStack[0] !== '')
            this.restore();
        var str = (
            '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
            '<svg xmlns="http://www.w3.org/2000/svg" ' +
            'xmlns:xlink="http://www.w3.org/1999/xlink" ' +
            'version="1.1" ' +
            'width="' + this.width + 'px" ' +
            'height="' + this.height + 'px">\n' +
            this._defs.join('\n') + '\n</defs>\n' +
            '<g stroke="none" fill="none">\n' +
            this._body.join('\n') + '\n' +
            '</g>\n</svg>\n'
        );
        return new Blob([str], {
            type: 'image/svg+xml'
        });
    }

};

// A PDF file writer, currently creating uncompressed PDF.
// See https://www.adobe.com/devnet/pdf/pdf_reference_archive.html.

function PdfWriterContext() {
    this._body = [];
    this._xPos = NaN;
    this._yPos = NaN;
    this._extGState = {
        Af255: '<< /ca 1 >>',
        As255: '<< /CA 1 >>'
    };
    this._objects = [
        ['%PDF-1.4\n']
    ];
    this._offset = this._objects[0][0].length;
    this._nextIndex = 5;
    this._imgcache = [];
    this._xobjects = {};
    this._pathUsed = -1;
    this._globalAlpha = 1;
    this._strokeAlpha = 1;
    this._fillAlpha = 1;

    this.width = 0;
    this.height = 0;
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.miterLimit = 10;
}

PdfWriterContext.prototype = {

    _cmd: function() {
        this._body.push(Array.prototype.join.call(arguments, ' '));
    },

    _setAlpha: function(alpha, prefix, param) {
        var val = Math.round(255 * alpha * this._globalAlpha);
        var name = prefix + val;
        this._extGState[name] = '<< /' + param + ' ' + (val / 255) + ' >>';
        this._cmd('/' + name, 'gs');
        return alpha;
    },

    set globalAlpha(alpha) {
        this._globalAlpha = alpha;
        this._setAlpha(this._strokeAlpha, 'As', 'CA');
        this._setAlpha(this._fillAlpha, 'Af', 'ca');
    },

    set fillStyle(style) {
        var self = this;
        parseColor(style, function(r, g, b, a) {
            self._cmd(r / 255, g / 255, b / 255, 'rg');
            self._setAlpha(self._fillAlpha = a, 'Af', 'ca');
        });
    },

    set strokeStyle(style) {
        var self = this;
        parseColor(style, function(r, g, b, a) {
            self._cmd(r / 255, g / 255, b / 255, 'RG');
            self._setAlpha(self._strokeAlpha = a, 'As', 'CA');
        });
    },

    set lineWidth(width) {
        this._cmd(width, 'w');
    },

    set lineCap(style) {
        this._cmd({
            butt: 0,
            round: 1,
            square: 2
        }[style], 'J');
    },

    set lineJoin(style) {
        this._cmd({
            miter: 0,
            round: 1,
            bevel: 2
        }[style], 'j');
    },

    set miterLimit(limit) {
        this._cmd(limit, 'M');
    },

    clearRect: function() {
        // Presumably this just clears everything in an already empty state.
        // But we already might have some transformations applied.
        // So let's just ignore this for now.
    },

    beginPath: function() {
        this._pathUsed = false;
    },

    closePath: function() {
        this._cmd('h');
    },

    moveTo: function(x, y) {
        this._cmd(this._xPos = x, this._yPos = -y, 'm');
    },

    lineTo: function(x, y) {
        this._cmd(this._xPos = x, this._yPos = -y, 'l');
    },

    bezierCurveTo: function(x1, y1, x2, y2, x3, y3) {
        this._cmd(x1, -y1, x2, -y2, this._xPos = x3, this._yPos = -y3, 'c');
    },

    quadraticCurveTo: function(x1, y1, x2, y2) {
        this.bezierCurveTo(
            (2 * x1 + this._xPos) / 3, (2 * y1 - this._yPos) / 3, (x2 + 2 * x1) / 3, (y2 + 2 * y1) / 3, x2, y2);
    },

    _kappa: 0.55228474983079340, // 4 * (Math.sqrt(2) - 1) / 3

    arc: function(x, y, r, a1, a2, dir) {
        if (a1 === 0 && a2 === 2 * Math.PI) {
            var k = this._kappa * r;
            this.moveTo(x + r, y);
            this.bezierCurveTo(x + r, y + k, x + k, y + r, x, y + r);
            this.bezierCurveTo(x - k, y + r, x - r, y + k, x - r, y);
            this.bezierCurveTo(x - r, y - k, x - k, y - r, x, y - r);
            this.bezierCurveTo(x + k, y - r, x + r, y - k, x + r, y);
            return;
        }
        throw Error('PdfWriterContext.arc only supports full circles');
    },

    rect: function(x, y, w, h) {
        this._cmd(x, -y, w, -h, 're');
    },

    _usePath: function(cmd) {
        if (this._pathUsed) {
            var prev = this._body[this._pathUsed];
            var combined = {
                'S + f': 'B',
                'f + S': 'B',
                'W n + S': 'W S',
                'W n + f': 'W f',
                'S + W n': 'W S',
                'f + W n': 'W f',
                'B + W n': 'W B',
                'W S + f': 'W B',
                'W f + S': 'W B',
            }[prev + ' + ' + cmd];
            if (!combined)
                throw Error("Don't know how to combine '" +
                    prev + "' and '" + cmd + "'");
            this._body.splice(this._pathUsed, 1);
            cmd = combined;
        }
        this._pathUsed = this._body.length;
        this._cmd(cmd);
    },

    fill: function() {
        this._usePath('f');
    },

    stroke: function() {
        this._usePath('S');
    },

    clip: function() {
        this._usePath('W n');
    },

    save: function() {
        this._cmd('q');
    },

    restore: function() {
        this._cmd('Q');
    },

    translate: function(x, y) {
        this.transform(1, 0, 0, 1, x, y);
    },

    rotate: function(rad) {
        var c = Math.cos(rad);
        var s = Math.sin(rad);
        this.transform(c, s, -s, c, 0, 0);
    },

    scale: function(x, y) {
        this.transform(x, 0, 0, y, 0, 0);
    },

    transform: function(a, b, c, d, e, f) {
        this._cmd(a, -b, -c, d, e, -f, 'cm');
    },

    _png: function(dataURL) {
        if (dataURL.substr(0, 22) !== 'data:image/png;base64,')
            return {
                error: 'Not a base64-encoded PNG file'
            };
        var bytes = base64Decode(dataURL.substr(22));
        var chunks = pngChunks(bytes);
        console.log('PNG chunks:',
            chunks.map(function(chunk) {
                return chunk.type;
            }));

        // Read header
        if (chunks[0].type !== 'IHDR')
            throw Error('Image does not start with an IHDR');
        var ihdr = chunks[0].data;
        var width = ((ihdr[0] << 24) | (ihdr[1] << 16) |
            (ihdr[2] << 8) | (ihdr[3])) >>> 0;
        var height = ((ihdr[4] << 24) | (ihdr[5] << 16) |
            (ihdr[6] << 8) | (ihdr[7])) >>> 0;
        var bitDepth = ihdr[8];
        var colorType = ihdr[9];
        var palette = (colorType & 1) !== 0;
        var grayscale = (colorType & 2) === 0;
        var alpha = (colorType & 4) !== 0;
        var compressionMethod = ihdr[10];
        var filterMethod = ihdr[11];
        var interlaceMethod = ihdr[12];
        if (compressionMethod !== 0)
            throw Error('Unsupported PNG compression method: ' +
                compressionMethod);
        if (filterMethod !== 0)
            throw Error('Unsupported PNG filter method: ' +
                filterMethod);
        if (interlaceMethod !== 0)
            return {
                error: 'Interlaced image not supported'
            };
        if (palette)
            return {
                error: 'Indexed PNG image not supported'
            };

        var smask = null;
        var numColors = grayscale ? 1 : 3;
        var idats = chunks.filter(function(chunk) {
            return chunk.type === 'IDAT';
        }).map(function(chunk) {
            return chunk.data;
        });
        if (alpha) {
            var pako = window.pako;
            var inflate = new pako.Inflate();
            var i;
            for (i = 0; i < idats.length; ++i)
                inflate.push(idats[i], i + 1 === idats.length);
            if (inflate.err) throw Error(inflate.err);
            var rgba = inflate.result;
            var bytesPerComponent = bitDepth >>> 3;
            var bytesPerPixel = (numColors + 1) * bytesPerComponent;
            var bytesPerLine = width * bytesPerPixel + 1;
            if (rgba.length !== height * bytesPerLine)
                throw Error("Data length mismatch");
            var colorBytesPerPixel = numColors * bytesPerComponent;
            var rgb = new Uint8Array(height * (width * colorBytesPerPixel + 1));
            var mask = new Uint8Array(height * (width * bytesPerComponent + 1));
            var a = 0;
            var b = 0;
            var c = 0;
            for (var y = 0; y < height; ++y) {
                rgb[b++] = mask[c++] = rgba[a++];
                for (var x = 0; x < width; ++x) {
                    for (i = 0; i < colorBytesPerPixel; ++i)
                        rgb[b++] = rgba[a++];
                    for (i = 0; i < bytesPerComponent; ++i)
                        mask[c++] = rgba[a++];
                }
            }
            if (a !== rgba.length || b !== rgb.length || c !== mask.length)
                throw Error("Seems we garbled our index computation somehow");
            mask = pako.deflate(mask);
            smask = this._strm({
                Type: '/XObject',
                Subtype: '/Image',
                Width: width,
                Height: height,
                ColorSpace: '/DeviceGray',
                BitsPerComponent: bitDepth,
                Filter: '/FlateDecode',
                DecodeParms: this._dict({
                    Predictor: 15,
                    Colors: 1,
                    BitsPerComponent: bitDepth,
                    Columns: width
                })
            }, mask).ref;
            idats = [pako.deflate(rgb)]; // continue with color only
        }

        var len = 0;
        idats.forEach(function(chunk) {
            len += chunk.length;
        });
        var xobj = this._obj([this._dict({
            Type: '/XObject',
            Subtype: '/Image',
            Name: '/img' + this._imgcache.length,
            Width: width,
            Height: height,
            ColorSpace: grayscale ? '/DeviceGray' : '/DeviceRGB',
            SMask: smask,
            BitsPerComponent: bitDepth,
            Length: len,
            Filter: '/FlateDecode',
            DecodeParms: this._dict({
                Predictor: 15,
                Colors: numColors,
                BitsPerComponent: bitDepth,
                Columns: width
            })
        }), '\nstream\n'].concat(idats, ['\nendstream']));
        return xobj;
    },

    drawImage: function(img, x, y) {
        if (arguments.length !== 3)
            throw Error('PdfWriterContext only supports ' +
                '3-argument version of drawImage');
        var idx = this._imgcache.indexOf(img);
        if (idx === -1) {
            idx = this._imgcache.length;
            this._imgcache.push(img);
            var xobj = this._png(img.cachedDataURL || '');
            if (xobj.hasOwnProperty('error'))
                xobj = this._png(imageToDataURL(img));
            if (xobj.hasOwnProperty('error'))
                throw Error(xobj.error);
            this._xobjects['img' + idx] = xobj.ref;
        }
        this._cmd('q');
        this._setAlpha(1, 'Af', 'ca');
        this._cmd(img.width, 0, 0, img.height, x, -y - img.height, 'cm');
        this._cmd('/img' + idx, 'Do');
        this._cmd('Q');
    },

    _dict: function(dict) {
        var res = '<<';
        for (var key in dict)
            res += ' /' + key + ' ' + dict[key];
        return res + ' >>';
    },

    // obj is either an array, or an object which will be treated as a dict.
    // This adds some fields to the object, to facilitate offset computations.
    // Elements of obj should be ASCII-only strings or typed arrays.
    _obj: function(obj, idx) {
        if (!idx) idx = this._nextIndex++;
        if (!Array.isArray(obj))
            obj = [this._dict(obj)];
        obj.index = idx;
        obj.ref = idx + ' 0 R';
        obj.offset = this._offset;
        var len = 0;
        obj.unshift(idx + ' 0 obj\n');
        obj.push('\nendobj\n');
        for (var i = 0; i < obj.length; ++i)
            len += obj[i].length;
        this._offset += len;
        this._objects.push(obj);
        return obj;
    },

    _strm: function(dict, data, idx) {
        dict.Length = data.length;
        return this._obj([
            this._dict(dict),
            '\nstream\n', data, '\nendstream'
        ], idx);
    },

    toBlob: function() {
        // See PDF reference 1.7 Appendix G
        var i;
        var mediaBox = '[' + [0, -this.height, this.width, 0].join(' ') + ']';
        this._obj({
            Type: '/Catalog',
            Pages: '2 0 R'
        }, 1);
        this._obj({
            Type: '/Pages',
            Kids: '[3 0 R]',
            Count: 1
        }, 2);
        this._obj({
            Type: '/Page',
            Parent: '2 0 R',
            MediaBox: mediaBox,
            Contents: '4 0 R',
            Resources: this._dict({
                ProcSet: '[/PDF /Text /ImageB /ImageC /ImageI]',
                XObject: this._dict(this._xobjects),
                ExtGState: this._dict(this._extGState)
            })
        }, 3);
        var body = this._body.join('\n');
        var buf = new Uint8Array(body.length);
        for (i = 0; i < body.length; ++i)
            buf[i] = body.charCodeAt(i) & 0xff;
        body = window.pako.deflate(buf);
        this._strm({
            Filter: '/FlateDecode'
        }, body, 4);
        var objects = this._objects;
        var byIndex = [];
        for (i = 1; i < objects.length; ++i)
            byIndex[objects[i].index] = objects[i];
        var xref = 'xref\n0 ' + byIndex.length + '\n';
        for (i = 0; i < byIndex.length; ++i) {
            if (!byIndex[i])
                xref += '0000000000 65535 f \n';
            else
                xref += padStr(String(byIndex[i].offset), 10) + ' 00000 n \n';
        }
        var trailer = 'trailer\n' + this._dict({
            Size: byIndex.length,
            Root: '1 0 R'
        }) + '\nstartxref\n' + this._offset + '\n%%EOF\n';
        objects = Array.prototype.concat.apply([], objects);
        objects.push(xref, trailer);
        return new Blob(objects, {
            type: 'application/pdf'
        });
    }

};

/*jshint +W078 */

function imageToDataURL(img, type) {
    var w = img.width;
    var h = img.height;
    var c = document.createElement('canvas');
    c.setAttribute('width', w);
    c.setAttribute('height', h);
    c.setAttribute('style', 'display:none;');
    var mainCanvas = globalInstance.canvas;
    mainCanvas.parentNode.insertBefore(c, mainCanvas.nextSibling);
    try {
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        return c.toDataURL(type || "image/png");
    } finally {
        c.parentNode.removeChild(c);
    }
}

function base64Decode(str) {
    var alphabet =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    str = str.replace(new RegExp('[^' + alphabet + ']+', 'g'), '');
    var bytes = new Uint8Array(str.length * 3 >> 2);
    var i, j, a, b, c, d;
    for (i = 0, j = 0; i + 3 < str.length; i += 4) {
        a = alphabet.indexOf(str.charAt(i));
        b = alphabet.indexOf(str.charAt(i + 1));
        c = alphabet.indexOf(str.charAt(i + 2));
        d = alphabet.indexOf(str.charAt(i + 3));
        bytes[j++] = (a << 2) | (b >> 4);
        bytes[j++] = (b << 4) | (c >> 2);
        bytes[j++] = (c << 6) | d;
    }
    switch (str.length - i) {
        case 0:
            break;
        case 2:
            a = alphabet.indexOf(str.charAt(i));
            b = alphabet.indexOf(str.charAt(i + 1));
            bytes[j++] = (a << 2) | (b >> 4);
            break;
        case 3:
            a = alphabet.indexOf(str.charAt(i));
            b = alphabet.indexOf(str.charAt(i + 1));
            c = alphabet.indexOf(str.charAt(i + 2));
            bytes[j++] = (a << 2) | (b >> 4);
            bytes[j++] = (b << 4) | (c >> 2);
            break;
        default:
            throw Error('Malformed Base64 input: ' +
                (str.length - i) + ' chars left: ' + str.substr(i));
    }
    if (j !== bytes.length)
        throw Error('Failed assertion: ' + j + ' should be ' + bytes.length);
    return bytes;
}

// See PNG specification at e.g. http://www.libpng.org/pub/png/
function pngChunks(bytes) {
    function u32be(offset) {
        return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) |
            (bytes[offset + 2] << 8) | (bytes[offset + 3])) >>> 0;
    }
    if (bytes.length < 57)
        throw Error('Too short to be a PNG file');
    if (u32be(0) !== 0x89504e47 || u32be(4) !== 0x0d0a1a0a)
        throw Error('PNG signature missing');
    var chunks = [];
    var pos = 8;
    while (pos < bytes.length) {
        if (pos + 12 > bytes.length)
            throw Error('Incomplete chunk at offset 0x' + pos.toString(16));
        var len = u32be(pos);
        if (len >= 0x80000000)
            throw Error('Chunk too long');
        var end = pos + 12 + len;
        if (end > bytes.length)
            throw Error('Incomplete chunk at offset 0x' + pos.toString(16));
        var type = bytes.subarray(pos + 4, pos + 8);
        type = String.fromCharCode.apply(String, type);
        chunks.push({
            len: len,
            type: type,
            data: bytes.subarray(pos + 8, pos + 8 + len),
            crc: u32be(pos + 8 + len)
        });
        pos = end;
    }
    return chunks;
}

function parseColor(spec, cb) {
    var match;
    if ((match = /^rgba\(([0-9.]+), *([0-9.]+), *([0-9.]+), *([0-9.]+)\)$/
            .exec(spec))) {
        cb(+match[1], +match[2], +match[3], +match[4]);
    } else if ((match = /^rgb\(([0-9.]+), *([0-9.]+), *([0-9.]+)\)$/
            .exec(spec))) {
        cb(+match[1], +match[2], +match[3], 1);
    } else {
        throw Error("Can't handle color style " + spec);
    }
}

function cacheImages(cb) {
    var toCache = 1;
    Object.keys(images).forEach(function(name) {
        var img = images[name].value.img;
        if (img.cachedDataURL !== undefined) return;
        if (!img.src) return;
        if (img.src.substr(0, 5) === 'data:') {
            img.cachedDataURL = img.src;
            return;
        }
        ++toCache;
        img.cachedDataURL = null;
        var req = new XMLHttpRequest();
        req.responseType = 'blob';
        req.onreadystatechange = function() {
            if (req.readyState !== XMLHttpRequest.DONE) return;
            if (req.status === 200) {
                var reader = new FileReader();
                reader.onloadend = function() {
                    img.cachedDataURL = reader.result;
                    console.log('Cached data for image ' + img.src);
                    if (--toCache === 0) cb();
                };
                reader.readAsDataURL(req.response);
            } else {
                console.error('Failed to load ' + img.src + ': ' +
                    req.statusText);
                if (--toCache === 0) cb();
            }
        };
        req.open('GET', img.src, true);
        req.send();
    });
    if (--toCache === 0) cb();
}

function padStr(str, len, chr) {
    if (!chr) chr = '0';
    while (str.length < len)
        str = chr + str;
    return str;
}

var exportedCanvasURL = null;

function releaseExportedObject() {
    if (exportedCanvasURL !== null) {
        window.URL.revokeObjectURL(exportedCanvasURL);
        exportedCanvasURL = null;
    }
}

shutdownHooks.push(releaseExportedObject);

// Export current contruction with given writer backend and open the
// result in a new tab.  Note that Firefox fails to show images embedded
// into an SVG.  So in the long run, saving is probably better than opening.
// Note: See https://github.com/eligrey/FileSaver.js/ for saving Blobs
function exportWith(Context) {
    cacheImages(function() {
        var origctx = csctx;
        try {
            csctx = new Context();
            csctx.width = csw;
            csctx.height = csh;
            updateCindy();
            var blob = csctx.toBlob();
            exportedCanvasURL = window.URL.createObjectURL(blob);

            downloadHelper(exportedCanvasURL);
        } finally {
            csctx = origctx;
        }
    });
}


/*!!
 *  Canvas 2 Svg v1.0.19
 *  A low level canvas to SVG converter. Uses a mock canvas context to build an SVG document.
 *
 *  Licensed under the MIT license:
 *  http://www.opensource.org/licenses/mit-license.php
 *
 *  Author:
 *  Kerry Liu
 *
 *  Copyright (c) 2014 Gliffy Inc.
 */

;(function () {
    "use strict";

    var STYLES, ctx, CanvasGradient, CanvasPattern, namedEntities;

    //helper function to format a string
    function format(str, args) {
        var keys = Object.keys(args), i;
        for (i=0; i<keys.length; i++) {
            str = str.replace(new RegExp("\\{" + keys[i] + "\\}", "gi"), args[keys[i]]);
        }
        return str;
    }

    //helper function that generates a random string
    function randomString(holder) {
        var chars, randomstring, i;
        if (!holder) {
            throw new Error("cannot create a random attribute name for an undefined object");
        }
        chars = "ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
        randomstring = "";
        do {
            randomstring = "";
            for (i = 0; i < 12; i++) {
                randomstring += chars[Math.floor(Math.random() * chars.length)];
            }
        } while (holder[randomstring]);
        return randomstring;
    }

    //helper function to map named to numbered entities
    function createNamedToNumberedLookup(items, radix) {
        var i, entity, lookup = {}, base10, base16;
        items = items.split(',');
        radix = radix || 10;
        // Map from named to numbered entities.
        for (i = 0; i < items.length; i += 2) {
            entity = '&' + items[i + 1] + ';';
            base10 = parseInt(items[i], radix);
            lookup[entity] = '&#'+base10+';';
        }
        //FF and IE need to create a regex from hex values ie &nbsp; == \xa0
        lookup["\\xa0"] = '&#160;';
        return lookup;
    }

    //helper function to map canvas-textAlign to svg-textAnchor
    function getTextAnchor(textAlign) {
        //TODO: support rtl languages
        var mapping = {"left":"start", "right":"end", "center":"middle", "start":"start", "end":"end"};
        return mapping[textAlign] || mapping.start;
    }

    //helper function to map canvas-textBaseline to svg-dominantBaseline
    function getDominantBaseline(textBaseline) {
        //INFO: not supported in all browsers
        var mapping = {"alphabetic": "alphabetic", "hanging": "hanging", "top":"text-before-edge", "bottom":"text-after-edge", "middle":"central"};
        return mapping[textBaseline] || mapping.alphabetic;
    }

    // Unpack entities lookup where the numbers are in radix 32 to reduce the size
    // entity mapping courtesy of tinymce
    namedEntities = createNamedToNumberedLookup(
        '50,nbsp,51,iexcl,52,cent,53,pound,54,curren,55,yen,56,brvbar,57,sect,58,uml,59,copy,' +
            '5a,ordf,5b,laquo,5c,not,5d,shy,5e,reg,5f,macr,5g,deg,5h,plusmn,5i,sup2,5j,sup3,5k,acute,' +
            '5l,micro,5m,para,5n,middot,5o,cedil,5p,sup1,5q,ordm,5r,raquo,5s,frac14,5t,frac12,5u,frac34,' +
            '5v,iquest,60,Agrave,61,Aacute,62,Acirc,63,Atilde,64,Auml,65,Aring,66,AElig,67,Ccedil,' +
            '68,Egrave,69,Eacute,6a,Ecirc,6b,Euml,6c,Igrave,6d,Iacute,6e,Icirc,6f,Iuml,6g,ETH,6h,Ntilde,' +
            '6i,Ograve,6j,Oacute,6k,Ocirc,6l,Otilde,6m,Ouml,6n,times,6o,Oslash,6p,Ugrave,6q,Uacute,' +
            '6r,Ucirc,6s,Uuml,6t,Yacute,6u,THORN,6v,szlig,70,agrave,71,aacute,72,acirc,73,atilde,74,auml,' +
            '75,aring,76,aelig,77,ccedil,78,egrave,79,eacute,7a,ecirc,7b,euml,7c,igrave,7d,iacute,7e,icirc,' +
            '7f,iuml,7g,eth,7h,ntilde,7i,ograve,7j,oacute,7k,ocirc,7l,otilde,7m,ouml,7n,divide,7o,oslash,' +
            '7p,ugrave,7q,uacute,7r,ucirc,7s,uuml,7t,yacute,7u,thorn,7v,yuml,ci,fnof,sh,Alpha,si,Beta,' +
            'sj,Gamma,sk,Delta,sl,Epsilon,sm,Zeta,sn,Eta,so,Theta,sp,Iota,sq,Kappa,sr,Lambda,ss,Mu,' +
            'st,Nu,su,Xi,sv,Omicron,t0,Pi,t1,Rho,t3,Sigma,t4,Tau,t5,Upsilon,t6,Phi,t7,Chi,t8,Psi,' +
            't9,Omega,th,alpha,ti,beta,tj,gamma,tk,delta,tl,epsilon,tm,zeta,tn,eta,to,theta,tp,iota,' +
            'tq,kappa,tr,lambda,ts,mu,tt,nu,tu,xi,tv,omicron,u0,pi,u1,rho,u2,sigmaf,u3,sigma,u4,tau,' +
            'u5,upsilon,u6,phi,u7,chi,u8,psi,u9,omega,uh,thetasym,ui,upsih,um,piv,812,bull,816,hellip,' +
            '81i,prime,81j,Prime,81u,oline,824,frasl,88o,weierp,88h,image,88s,real,892,trade,89l,alefsym,' +
            '8cg,larr,8ch,uarr,8ci,rarr,8cj,darr,8ck,harr,8dl,crarr,8eg,lArr,8eh,uArr,8ei,rArr,8ej,dArr,' +
            '8ek,hArr,8g0,forall,8g2,part,8g3,exist,8g5,empty,8g7,nabla,8g8,isin,8g9,notin,8gb,ni,8gf,prod,' +
            '8gh,sum,8gi,minus,8gn,lowast,8gq,radic,8gt,prop,8gu,infin,8h0,ang,8h7,and,8h8,or,8h9,cap,8ha,cup,' +
            '8hb,int,8hk,there4,8hs,sim,8i5,cong,8i8,asymp,8j0,ne,8j1,equiv,8j4,le,8j5,ge,8k2,sub,8k3,sup,8k4,' +
            'nsub,8k6,sube,8k7,supe,8kl,oplus,8kn,otimes,8l5,perp,8m5,sdot,8o8,lceil,8o9,rceil,8oa,lfloor,8ob,' +
            'rfloor,8p9,lang,8pa,rang,9ea,loz,9j0,spades,9j3,clubs,9j5,hearts,9j6,diams,ai,OElig,aj,oelig,b0,' +
            'Scaron,b1,scaron,bo,Yuml,m6,circ,ms,tilde,802,ensp,803,emsp,809,thinsp,80c,zwnj,80d,zwj,80e,lrm,' +
            '80f,rlm,80j,ndash,80k,mdash,80o,lsquo,80p,rsquo,80q,sbquo,80s,ldquo,80t,rdquo,80u,bdquo,810,dagger,' +
            '811,Dagger,81g,permil,81p,lsaquo,81q,rsaquo,85c,euro', 32);


    //Some basic mappings for attributes and default values.
    STYLES = {
        "strokeStyle":{
            svgAttr : "stroke", //corresponding svg attribute
            canvas : "#000000", //canvas default
            svg : "none",       //svg default
            apply : "stroke"    //apply on stroke() or fill()
        },
        "fillStyle":{
            svgAttr : "fill",
            canvas : "#000000",
            svg : null, //svg default is black, but we need to special case this to handle canvas stroke without fill
            apply : "fill"
        },
        "lineCap":{
            svgAttr : "stroke-linecap",
            canvas : "butt",
            svg : "butt",
            apply : "stroke"
        },
        "lineJoin":{
            svgAttr : "stroke-linejoin",
            canvas : "miter",
            svg : "miter",
            apply : "stroke"
        },
        "miterLimit":{
            svgAttr : "stroke-miterlimit",
            canvas : 10,
            svg : 4,
            apply : "stroke"
        },
        "lineWidth":{
            svgAttr : "stroke-width",
            canvas : 1,
            svg : 1,
            apply : "stroke"
        },
        "globalAlpha": {
            svgAttr : "opacity",
            canvas : 1,
            svg : 1,
            apply :  "fill stroke"
        },
        "font":{
            //font converts to multiple svg attributes, there is custom logic for this
            canvas : "10px sans-serif"
        },
        "shadowColor":{
            canvas : "#000000"
        },
        "shadowOffsetX":{
            canvas : 0
        },
        "shadowOffsetY":{
            canvas : 0
        },
        "shadowBlur":{
            canvas : 0
        },
        "textAlign":{
            canvas : "start"
        },
        "textBaseline":{
            canvas : "alphabetic"
        },
        "lineDash" : {
            svgAttr : "stroke-dasharray",
            canvas : [],
            svg : null,
            apply : "stroke"
        }
    };

    /**
     *
     * @param gradientNode - reference to the gradient
     * @constructor
     */
    CanvasGradient = function (gradientNode, ctx) {
        this.__root = gradientNode;
        this.__ctx = ctx;
    };

    /**
     * Adds a color stop to the gradient root
     */
    CanvasGradient.prototype.addColorStop = function (offset, color) {
        var stop = this.__ctx.__createElement("stop"), regex, matches;
        stop.setAttribute("offset", offset);
        if (color.indexOf("rgba") !== -1) {
            //separate alpha value, since webkit can't handle it
            regex = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d?\.?\d*)\s*\)/gi;
            matches = regex.exec(color);
            stop.setAttribute("stop-color", format("rgb({r},{g},{b})", {r:matches[1], g:matches[2], b:matches[3]}));
            stop.setAttribute("stop-opacity", matches[4]);
        } else {
            stop.setAttribute("stop-color", color);
        }
        this.__root.appendChild(stop);
    };

    CanvasPattern = function (pattern, ctx) {
        this.__root = pattern;
        this.__ctx = ctx;
    };

    /**
     * The mock canvas context
     * @param o - options include:
     * ctx - existing Context2D to wrap around
     * width - width of your canvas (defaults to 500)
     * height - height of your canvas (defaults to 500)
     * enableMirroring - enables canvas mirroring (get image data) (defaults to false)
     * document - the document object (defaults to the current document)
     */
    ctx = function (o) {
        var defaultOptions = { width:500, height:500, enableMirroring : false}, options;

        //keep support for this way of calling C2S: new C2S(width,height)
        if (arguments.length > 1) {
            options = defaultOptions;
            options.width = arguments[0];
            options.height = arguments[1];
        } else if ( !o ) {
            options = defaultOptions;
        } else {
            options = o;
        }

        if (!(this instanceof ctx)) {
            //did someone call this without new?
            return new ctx(options);
        }

        //setup options
        this.width = options.width || defaultOptions.width;
        this.height = options.height || defaultOptions.height;
        this.enableMirroring = options.enableMirroring !== undefined ? options.enableMirroring : defaultOptions.enableMirroring;

        this.canvas = this;   ///point back to this instance!
        this.__document = options.document || document;

        // allow passing in an existing context to wrap around
        // if a context is passed in, we know a canvas already exist
        if (options.ctx) {
            this.__ctx = options.ctx;
        } else {
            this.__canvas = this.__document.createElement("canvas");
            this.__ctx = this.__canvas.getContext("2d");
        }

        this.__setDefaultStyles();
        this.__stack = [this.__getStyleState()];
        this.__groupStack = [];

        //the root svg element
        this.__root = this.__document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.__root.setAttribute("version", 1.1);
        this.__root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        this.__root.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", "http://www.w3.org/1999/xlink");
        this.__root.setAttribute("width", this.width);
        this.__root.setAttribute("height", this.height);

        //make sure we don't generate the same ids in defs
        this.__ids = {};

        //defs tag
        this.__defs = this.__document.createElementNS("http://www.w3.org/2000/svg", "defs");
        this.__root.appendChild(this.__defs);

        //also add a group child. the svg element can't use the transform attribute
        this.__currentElement = this.__document.createElementNS("http://www.w3.org/2000/svg", "g");
        this.__root.appendChild(this.__currentElement);
    };


    /**
     * Creates the specified svg element
     * @private
     */
    ctx.prototype.__createElement = function (elementName, properties, resetFill) {
        if (typeof properties === "undefined") {
            properties = {};
        }

        var element = this.__document.createElementNS("http://www.w3.org/2000/svg", elementName),
            keys = Object.keys(properties), i, key;
        if (resetFill) {
            //if fill or stroke is not specified, the svg element should not display. By default SVG's fill is black.
            element.setAttribute("fill", "none");
            element.setAttribute("stroke", "none");
        }
        for (i=0; i<keys.length; i++) {
            key = keys[i];
            element.setAttribute(key, properties[key]);
        }
        return element;
    };

    /**
     * Applies default canvas styles to the context
     * @private
     */
    ctx.prototype.__setDefaultStyles = function () {
        //default 2d canvas context properties see:http://www.w3.org/TR/2dcontext/
        var keys = Object.keys(STYLES), i, key;
        for (i=0; i<keys.length; i++) {
            key = keys[i];
            this[key] = STYLES[key].canvas;
        }
    };

    /**
     * Applies styles on restore
     * @param styleState
     * @private
     */
    ctx.prototype.__applyStyleState = function (styleState) {
        var keys = Object.keys(styleState), i, key;
        for (i=0; i<keys.length; i++) {
            key = keys[i];
            this[key] = styleState[key];
        }
    };

    /**
     * Gets the current style state
     * @return {Object}
     * @private
     */
    ctx.prototype.__getStyleState = function () {
        var i, styleState = {}, keys = Object.keys(STYLES), key;
        for (i=0; i<keys.length; i++) {
            key = keys[i];
            styleState[key] = this[key];
        }
        return styleState;
    };

    /**
     * Apples the current styles to the current SVG element. On "ctx.fill" or "ctx.stroke"
     * @param type
     * @private
     */
    ctx.prototype.__applyStyleToCurrentElement = function (type) {
    	var currentElement = this.__currentElement;
    	var currentStyleGroup = this.__currentElementsToStyle;
    	if (currentStyleGroup) {
    		currentElement.setAttribute(type, "");
    		currentElement = currentStyleGroup.element;
    		currentStyleGroup.children.forEach(function (node) {
    			node.setAttribute(type, "");
    		})
    	}

        var keys = Object.keys(STYLES), i, style, value, id, regex, matches;
        for (i = 0; i < keys.length; i++) {
            style = STYLES[keys[i]];
            value = this[keys[i]];
            if (style.apply) {
                //is this a gradient or pattern?
                if (value instanceof CanvasPattern) {
                    //pattern
                    if (value.__ctx) {
                        //copy over defs
                        while(value.__ctx.__defs.childNodes.length) {
                            id = value.__ctx.__defs.childNodes[0].getAttribute("id");
                            this.__ids[id] = id;
                            this.__defs.appendChild(value.__ctx.__defs.childNodes[0]);
                        }
                    }
                    currentElement.setAttribute(style.apply, format("url(#{id})", {id:value.__root.getAttribute("id")}));
                }
                else if (value instanceof CanvasGradient) {
                    //gradient
                    currentElement.setAttribute(style.apply, format("url(#{id})", {id:value.__root.getAttribute("id")}));
                } else if (style.apply.indexOf(type)!==-1 && style.svg !== value) {
                    if ((style.svgAttr === "stroke" || style.svgAttr === "fill") && value.indexOf("rgba") !== -1) {
                        //separate alpha value, since illustrator can't handle it
                        regex = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d?\.?\d*)\s*\)/gi;
                        matches = regex.exec(value);
                        currentElement.setAttribute(style.svgAttr, format("rgb({r},{g},{b})", {r:matches[1], g:matches[2], b:matches[3]}));
                        //should take globalAlpha here
                        var opacity = matches[4];
                        var globalAlpha = this.globalAlpha;
                        if (globalAlpha != null) {
                            opacity *= globalAlpha;
                        }
                        currentElement.setAttribute(style.svgAttr+"-opacity", opacity);
                    } else {
                        var attr = style.svgAttr;
                        if (keys[i] === 'globalAlpha') {
                            attr = type+'-'+style.svgAttr;
                            if (currentElement.getAttribute(attr)) {
                                 //fill-opacity or stroke-opacity has already been set by stroke or fill.
                                continue;
                            }
                        }
                        //otherwise only update attribute if right type, and not svg default
                        currentElement.setAttribute(attr, value);
                    }
                }
            }
        }
    };

    /**
     * Will return the closest group or svg node. May return the current element.
     * @private
     */
    ctx.prototype.__closestGroupOrSvg = function (node) {
        node = node || this.__currentElement;
        if (node.nodeName === "g" || node.nodeName === "svg") {
            return node;
        } else {
            return this.__closestGroupOrSvg(node.parentNode);
        }
    };

    /**
     * Returns the serialized value of the svg so far
     * @param fixNamedEntities - Standalone SVG doesn't support named entities, which document.createTextNode encodes.
     *                           If true, we attempt to find all named entities and encode it as a numeric entity.
     * @return serialized svg
     */
    ctx.prototype.getSerializedSvg = function (fixNamedEntities) {
        var serialized = new XMLSerializer().serializeToString(this.__root),
            keys, i, key, value, regexp, xmlns;

        //IE search for a duplicate xmnls because they didn't implement setAttributeNS correctly
        xmlns = /xmlns="http:\/\/www\.w3\.org\/2000\/svg".+xmlns="http:\/\/www\.w3\.org\/2000\/svg/gi;
        if (xmlns.test(serialized)) {
            serialized = serialized.replace('xmlns="http://www.w3.org/2000/svg','xmlns:xlink="http://www.w3.org/1999/xlink');
        }

        if (fixNamedEntities) {
            keys = Object.keys(namedEntities);
            //loop over each named entity and replace with the proper equivalent.
            for (i=0; i<keys.length; i++) {
                key = keys[i];
                value = namedEntities[key];
                regexp = new RegExp(key, "gi");
                if (regexp.test(serialized)) {
                    serialized = serialized.replace(regexp, value);
                }
            }
        }

        return serialized;
    };


    /**
     * Returns the root svg
     * @return
     */
    ctx.prototype.getSvg = function () {
        return this.__root;
    };
    /**
     * Will generate a group tag.
     */
    ctx.prototype.save = function () {
        var group = this.__createElement("g");
        var parent = this.__closestGroupOrSvg();
        this.__groupStack.push(parent);
        parent.appendChild(group);
        this.__currentElement = group;
        this.__stack.push(this.__getStyleState());
    };
    /**
     * Sets current element to parent, or just root if already root
     */
    ctx.prototype.restore = function () {
        this.__currentElement = this.__groupStack.pop();
        this.__currentElementsToStyle = null;
        //Clearing canvas will make the poped group invalid, currentElement is set to the root group node.
        if (!this.__currentElement) {
            this.__currentElement = this.__root.childNodes[1];
        }
        var state = this.__stack.pop();
        this.__applyStyleState(state);
    };

    /**
     * Helper method to add transform
     * @private
     */
    ctx.prototype.__addTransform = function (t) {
        //if the current element has siblings, add another group
        var parent = this.__closestGroupOrSvg();
        if (parent.childNodes.length > 0) {
        	if (this.__currentElement.nodeName === "path") {
        		if (!this.__currentElementsToStyle) this.__currentElementsToStyle = {element: parent, children: []};
        		this.__currentElementsToStyle.children.push(this.__currentElement)
        		this.__applyCurrentDefaultPath();
        	}

            var group = this.__createElement("g");
            parent.appendChild(group);
            this.__currentElement = group;
        }

        var transform = this.__currentElement.getAttribute("transform");
        if (transform) {
            transform += " ";
        } else {
            transform = "";
        }
        transform += t;
        this.__currentElement.setAttribute("transform", transform);
    };

    /**
     *  scales the current element
     */
    ctx.prototype.scale = function (x, y) {
        if (y === undefined) {
            y = x;
        }
        this.__addTransform(format("scale({x},{y})", {x:x, y:y}));
    };

    /**
     * rotates the current element
     */
    ctx.prototype.rotate = function (angle) {
        var degrees = (angle * 180 / Math.PI);
        this.__addTransform(format("rotate({angle},{cx},{cy})", {angle:degrees, cx:0, cy:0}));
    };

    /**
     * translates the current element
     */
    ctx.prototype.translate = function (x, y) {
        this.__addTransform(format("translate({x},{y})", {x:x,y:y}));
    };

    /**
     * applies a transform to the current element
     */
    ctx.prototype.transform = function (a, b, c, d, e, f) {
        this.__addTransform(format("matrix({a},{b},{c},{d},{e},{f})", {a:a, b:b, c:c, d:d, e:e, f:f}));
    };

    /**
     * Create a new Path Element
     */
    ctx.prototype.beginPath = function () {
        var path, parent;

        // Note that there is only one current default path, it is not part of the drawing state.
        // See also: https://html.spec.whatwg.org/multipage/scripting.html#current-default-path
        this.__currentDefaultPath = "";
        this.__currentPosition = {};

        path = this.__createElement("path", {}, true);
        parent = this.__closestGroupOrSvg();
        parent.appendChild(path);
        this.__currentElement = path;
    };

    /**
     * Helper function to apply currentDefaultPath to current path element
     * @private
     */
    ctx.prototype.__applyCurrentDefaultPath = function () {
    	var currentElement = this.__currentElement;
        if (currentElement.nodeName === "path") {
			currentElement.setAttribute("d", this.__currentDefaultPath);
        } else {
			console.error("Attempted to apply path command to node", currentElement.nodeName);
        }
    };

    /**
     * Helper function to add path command
     * @private
     */
    ctx.prototype.__addPathCommand = function (command) {
        this.__currentDefaultPath += " ";
        this.__currentDefaultPath += command;
    };

    /**
     * Adds the move command to the current path element,
     * if the currentPathElement is not empty create a new path element
     */
    ctx.prototype.moveTo = function (x,y) {
        if (this.__currentElement.nodeName !== "path") {
            this.beginPath();
        }

        // creates a new subpath with the given point
        this.__currentPosition = {x: x, y: y};
        this.__addPathCommand(format("M {x} {y}", {x:x, y:y}));
    };

    /**
     * Closes the current path
     */
    ctx.prototype.closePath = function () {
        if (this.__currentDefaultPath) {
            this.__addPathCommand("Z");
        }
    };

    /**
     * Adds a line to command
     */
    ctx.prototype.lineTo = function (x, y) {
        this.__currentPosition = {x: x, y: y};
        if (this.__currentDefaultPath.indexOf('M') > -1) {
            this.__addPathCommand(format("L {x} {y}", {x:x, y:y}));
        } else {
            this.__addPathCommand(format("M {x} {y}", {x:x, y:y}));
        }
    };

    /**
     * Add a bezier command
     */
    ctx.prototype.bezierCurveTo = function (cp1x, cp1y, cp2x, cp2y, x, y) {
        this.__currentPosition = {x: x, y: y};
        this.__addPathCommand(format("C {cp1x} {cp1y} {cp2x} {cp2y} {x} {y}",
            {cp1x:cp1x, cp1y:cp1y, cp2x:cp2x, cp2y:cp2y, x:x, y:y}));
    };

    /**
     * Adds a quadratic curve to command
     */
    ctx.prototype.quadraticCurveTo = function (cpx, cpy, x, y) {
        this.__currentPosition = {x: x, y: y};
        this.__addPathCommand(format("Q {cpx} {cpy} {x} {y}", {cpx:cpx, cpy:cpy, x:x, y:y}));
    };


    /**
     * Return a new normalized vector of given vector
     */
    var normalize = function (vector) {
        var len = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1]);
        return [vector[0] / len, vector[1] / len];
    };

    /**
     * Adds the arcTo to the current path
     *
     * @see http://www.w3.org/TR/2015/WD-2dcontext-20150514/#dom-context-2d-arcto
     */
    ctx.prototype.arcTo = function (x1, y1, x2, y2, radius) {
        // Let the point (x0, y0) be the last point in the subpath.
        var x0 = this.__currentPosition && this.__currentPosition.x;
        var y0 = this.__currentPosition && this.__currentPosition.y;

        // First ensure there is a subpath for (x1, y1).
        if (typeof x0 == "undefined" || typeof y0 == "undefined") {
            return;
        }

        // Negative values for radius must cause the implementation to throw an IndexSizeError exception.
        if (radius < 0) {
            throw new Error("IndexSizeError: The radius provided (" + radius + ") is negative.");
        }

        // If the point (x0, y0) is equal to the point (x1, y1),
        // or if the point (x1, y1) is equal to the point (x2, y2),
        // or if the radius radius is zero,
        // then the method must add the point (x1, y1) to the subpath,
        // and connect that point to the previous point (x0, y0) by a straight line.
        if (((x0 === x1) && (y0 === y1))
            || ((x1 === x2) && (y1 === y2))
            || (radius === 0)) {
            this.lineTo(x1, y1);
            return;
        }

        // Otherwise, if the points (x0, y0), (x1, y1), and (x2, y2) all lie on a single straight line,
        // then the method must add the point (x1, y1) to the subpath,
        // and connect that point to the previous point (x0, y0) by a straight line.
        var unit_vec_p1_p0 = normalize([x0 - x1, y0 - y1]);
        var unit_vec_p1_p2 = normalize([x2 - x1, y2 - y1]);
        if (unit_vec_p1_p0[0] * unit_vec_p1_p2[1] === unit_vec_p1_p0[1] * unit_vec_p1_p2[0]) {
            this.lineTo(x1, y1);
            return;
        }

        // Otherwise, let The Arc be the shortest arc given by circumference of the circle that has radius radius,
        // and that has one point tangent to the half-infinite line that crosses the point (x0, y0) and ends at the point (x1, y1),
        // and that has a different point tangent to the half-infinite line that ends at the point (x1, y1), and crosses the point (x2, y2).
        // The points at which this circle touches these two lines are called the start and end tangent points respectively.

        // note that both vectors are unit vectors, so the length is 1
        var cos = (unit_vec_p1_p0[0] * unit_vec_p1_p2[0] + unit_vec_p1_p0[1] * unit_vec_p1_p2[1]);
        var theta = Math.acos(Math.abs(cos));

        // Calculate origin
        var unit_vec_p1_origin = normalize([
            unit_vec_p1_p0[0] + unit_vec_p1_p2[0],
            unit_vec_p1_p0[1] + unit_vec_p1_p2[1]
        ]);
        var len_p1_origin = radius / Math.sin(theta / 2);
        var x = x1 + len_p1_origin * unit_vec_p1_origin[0];
        var y = y1 + len_p1_origin * unit_vec_p1_origin[1];

        // Calculate start angle and end angle
        // rotate 90deg clockwise (note that y axis points to its down)
        var unit_vec_origin_start_tangent = [
            -unit_vec_p1_p0[1],
            unit_vec_p1_p0[0]
        ];
        // rotate 90deg counter clockwise (note that y axis points to its down)
        var unit_vec_origin_end_tangent = [
            unit_vec_p1_p2[1],
            -unit_vec_p1_p2[0]
        ];
        var getAngle = function (vector) {
            // get angle (clockwise) between vector and (1, 0)
            var x = vector[0];
            var y = vector[1];
            if (y >= 0) { // note that y axis points to its down
                return Math.acos(x);
            } else {
                return -Math.acos(x);
            }
        };
        var startAngle = getAngle(unit_vec_origin_start_tangent);
        var endAngle = getAngle(unit_vec_origin_end_tangent);

        // Connect the point (x0, y0) to the start tangent point by a straight line
        this.lineTo(x + unit_vec_origin_start_tangent[0] * radius,
                    y + unit_vec_origin_start_tangent[1] * radius);

        // Connect the start tangent point to the end tangent point by arc
        // and adding the end tangent point to the subpath.
        this.arc(x, y, radius, startAngle, endAngle);
    };

    /**
     * Sets the stroke property on the current element
     */
    ctx.prototype.stroke = function () {
        if (this.__currentElement.nodeName === "path") {
            this.__currentElement.setAttribute("paint-order", "fill stroke markers");
        }
        this.__applyCurrentDefaultPath();
        this.__applyStyleToCurrentElement("stroke");
    };

    /**
     * Sets fill properties on the current element
     */
    ctx.prototype.fill = function () {
        if (this.__currentElement.nodeName === "path") {
            this.__currentElement.setAttribute("paint-order", "stroke fill markers");
        }
        this.__applyCurrentDefaultPath();
        this.__applyStyleToCurrentElement("fill");
    };

    /**
     *  Adds a rectangle to the path.
     */
    ctx.prototype.rect = function (x, y, width, height) {
        if (this.__currentElement.nodeName !== "path") {
            this.beginPath();
        }
        this.moveTo(x, y);
        this.lineTo(x+width, y);
        this.lineTo(x+width, y+height);
        this.lineTo(x, y+height);
        this.lineTo(x, y);
        this.closePath();
    };


    /**
     * adds a rectangle element
     */
    ctx.prototype.fillRect = function (x, y, width, height) {
        var rect, parent;
        rect = this.__createElement("rect", {
            x : x,
            y : y,
            width : width,
            height : height
        }, true);
        parent = this.__closestGroupOrSvg();
        parent.appendChild(rect);
        this.__currentElement = rect;
        this.__applyStyleToCurrentElement("fill");
    };

    /**
     * Draws a rectangle with no fill
     * @param x
     * @param y
     * @param width
     * @param height
     */
    ctx.prototype.strokeRect = function (x, y, width, height) {
        var rect, parent;
        rect = this.__createElement("rect", {
            x : x,
            y : y,
            width : width,
            height : height
        }, true);
        parent = this.__closestGroupOrSvg();
        parent.appendChild(rect);
        this.__currentElement = rect;
        this.__applyStyleToCurrentElement("stroke");
    };


    /**
     * Clear entire canvas:
     * 1. save current transforms
     * 2. remove all the childNodes of the root g element
     */
    ctx.prototype.__clearCanvas = function () {
        var current = this.__closestGroupOrSvg(),
            transform = current.getAttribute("transform");
        var rootGroup = this.__root.childNodes[1];
        var childNodes = rootGroup.childNodes;
        for (var i = childNodes.length - 1; i >= 0; i--) {
            if (childNodes[i]) {
                rootGroup.removeChild(childNodes[i]);
            }
        }
        this.__currentElement = rootGroup;
        //reset __groupStack as all the child group nodes are all removed.
        this.__groupStack = [];
        if (transform) {
            this.__addTransform(transform);
        }
    };

    /**
     * "Clears" a canvas by just drawing a white rectangle in the current group.
     */
    ctx.prototype.clearRect = function (x, y, width, height) {
        //clear entire canvas
        if (x === 0 && y === 0 && width === this.width && height === this.height) {
            this.__clearCanvas();
            return;
        }
        var rect, parent = this.__closestGroupOrSvg();
        rect = this.__createElement("rect", {
            x : x,
            y : y,
            width : width,
            height : height,
            fill : "#FFFFFF"
        }, true);
        parent.appendChild(rect);
    };

    /**
     * Adds a linear gradient to a defs tag.
     * Returns a canvas gradient object that has a reference to it's parent def
     */
    ctx.prototype.createLinearGradient = function (x1, y1, x2, y2) {
        var grad = this.__createElement("linearGradient", {
            id : randomString(this.__ids),
            x1 : x1+"px",
            x2 : x2+"px",
            y1 : y1+"px",
            y2 : y2+"px",
            "gradientUnits" : "userSpaceOnUse"
        }, false);
        this.__defs.appendChild(grad);
        return new CanvasGradient(grad, this);
    };

    /**
     * Adds a radial gradient to a defs tag.
     * Returns a canvas gradient object that has a reference to it's parent def
     */
    ctx.prototype.createRadialGradient = function (x0, y0, r0, x1, y1, r1) {
        var grad = this.__createElement("radialGradient", {
            id : randomString(this.__ids),
            cx : x1+"px",
            cy : y1+"px",
            r  : r1+"px",
            fx : x0+"px",
            fy : y0+"px",
            "gradientUnits" : "userSpaceOnUse"
        }, false);
        this.__defs.appendChild(grad);
        return new CanvasGradient(grad, this);

    };

    /**
     * Parses the font string and returns svg mapping
     * @private
     */
    ctx.prototype.__parseFont = function () {
        var regex = /^\s*(?=(?:(?:[-a-z]+\s*){0,2}(italic|oblique))?)(?=(?:(?:[-a-z]+\s*){0,2}(small-caps))?)(?=(?:(?:[-a-z]+\s*){0,2}(bold(?:er)?|lighter|[1-9]00))?)(?:(?:normal|\1|\2|\3)\s*){0,3}((?:xx?-)?(?:small|large)|medium|smaller|larger|[.\d]+(?:\%|in|[cem]m|ex|p[ctx]))(?:\s*\/\s*(normal|[.\d]+(?:\%|in|[cem]m|ex|p[ctx])))?\s*([-,\'\"\sa-z0-9]+?)\s*$/i;
        var fontPart = regex.exec( this.font );
        var data = {
            style : fontPart[1] || 'normal',
            size : fontPart[4] || '10px',
            family : fontPart[6] || 'sans-serif',
            weight: fontPart[3] || 'normal',
            decoration : fontPart[2] || 'normal',
            href : null
        };

        //canvas doesn't support underline natively, but we can pass this attribute
        if (this.__fontUnderline === "underline") {
            data.decoration = "underline";
        }

        //canvas also doesn't support linking, but we can pass this as well
        if (this.__fontHref) {
            data.href = this.__fontHref;
        }

        return data;
    };

    /**
     * Helper to link text fragments
     * @param font
     * @param element
     * @return {*}
     * @private
     */
    ctx.prototype.__wrapTextLink = function (font, element) {
        if (font.href) {
            var a = this.__createElement("a");
            a.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", font.href);
            a.appendChild(element);
            return a;
        }
        return element;
    };

    /**
     * Fills or strokes text
     * @param text
     * @param x
     * @param y
     * @param action - stroke or fill
     * @private
     */
    ctx.prototype.__applyText = function (text, x, y, action) {
        var font = this.__parseFont(),
            parent = this.__closestGroupOrSvg(),
            textElement = this.__createElement("text", {
                "font-family" : font.family,
                "font-size" : font.size,
                "font-style" : font.style,
                "font-weight" : font.weight,
                "text-decoration" : font.decoration,
                "x" : x,
                "y" : y,
                "text-anchor": getTextAnchor(this.textAlign),
                "dominant-baseline": getDominantBaseline(this.textBaseline)
            }, true);

        textElement.appendChild(this.__document.createTextNode(text));
        this.__currentElement = textElement;
        this.__applyStyleToCurrentElement(action);
        parent.appendChild(this.__wrapTextLink(font,textElement));
    };

    /**
     * Creates a text element
     * @param text
     * @param x
     * @param y
     */
    ctx.prototype.fillText = function (text, x, y) {
        this.__applyText(text, x, y, "fill");
    };

    /**
     * Strokes text
     * @param text
     * @param x
     * @param y
     */
    ctx.prototype.strokeText = function (text, x, y) {
        this.__applyText(text, x, y, "stroke");
    };

    /**
     * No need to implement this for svg.
     * @param text
     * @return {TextMetrics}
     */
    ctx.prototype.measureText = function (text) {
        this.__ctx.font = this.font;
        return this.__ctx.measureText(text);
    };

    /**
     *  Arc command!
     */
    ctx.prototype.arc = function (x, y, radius, startAngle, endAngle, counterClockwise) {
        // in canvas no circle is drawn if no angle is provided.
        if (startAngle === endAngle) {
            return;
        }
        startAngle = startAngle % (2*Math.PI);
        endAngle = endAngle % (2*Math.PI);
        if (startAngle === endAngle) {
            //circle time! subtract some of the angle so svg is happy (svg elliptical arc can't draw a full circle)
            endAngle = ((endAngle + (2*Math.PI)) - 0.001 * (counterClockwise ? -1 : 1)) % (2*Math.PI);
        }
        var endX = x+radius*Math.cos(endAngle),
            endY = y+radius*Math.sin(endAngle),
            startX = x+radius*Math.cos(startAngle),
            startY = y+radius*Math.sin(startAngle),
            sweepFlag = counterClockwise ? 0 : 1,
            largeArcFlag = 0,
            diff = endAngle - startAngle;

        // https://github.com/gliffy/canvas2svg/issues/4
        if (diff < 0) {
            diff += 2*Math.PI;
        }

        if (counterClockwise) {
            largeArcFlag = diff > Math.PI ? 0 : 1;
        } else {
            largeArcFlag = diff > Math.PI ? 1 : 0;
        }

        this.lineTo(startX, startY);
        this.__addPathCommand(format("A {rx} {ry} {xAxisRotation} {largeArcFlag} {sweepFlag} {endX} {endY}",
            {rx:radius, ry:radius, xAxisRotation:0, largeArcFlag:largeArcFlag, sweepFlag:sweepFlag, endX:endX, endY:endY}));

        this.__currentPosition = {x: endX, y: endY};
    };

    /**
     * Generates a ClipPath from the clip command.
     */
    ctx.prototype.clip = function () {
        var group = this.__closestGroupOrSvg(),
            clipPath = this.__createElement("clipPath"),
            id =  randomString(this.__ids),
            newGroup = this.__createElement("g");

        this.__applyCurrentDefaultPath();
        group.removeChild(this.__currentElement);
        clipPath.setAttribute("id", id);
        clipPath.appendChild(this.__currentElement);

        this.__defs.appendChild(clipPath);

        //set the clip path to this group
        group.setAttribute("clip-path", format("url(#{id})", {id:id}));

        //clip paths can be scaled and transformed, we need to add another wrapper group to avoid later transformations
        // to this path
        group.appendChild(newGroup);

        this.__currentElement = newGroup;

    };

    /**
     * Draws a canvas, image or mock context to this canvas.
     * Note that all svg dom manipulation uses node.childNodes rather than node.children for IE support.
     * http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-drawimage
     */
    ctx.prototype.drawImage = function () {
        //convert arguments to a real array
        var args = Array.prototype.slice.call(arguments),
            image=args[0],
            dx, dy, dw, dh, sx=0, sy=0, sw, sh, parent, svg, defs, group,
            currentElement, svgImage, canvas, context, id;

        if (args.length === 3) {
            dx = args[1];
            dy = args[2];
            sw = image.width;
            sh = image.height;
            dw = sw;
            dh = sh;
        } else if (args.length === 5) {
            dx = args[1];
            dy = args[2];
            dw = args[3];
            dh = args[4];
            sw = image.width;
            sh = image.height;
        } else if (args.length === 9) {
            sx = args[1];
            sy = args[2];
            sw = args[3];
            sh = args[4];
            dx = args[5];
            dy = args[6];
            dw = args[7];
            dh = args[8];
        } else {
            throw new Error("Invalid number of arguments passed to drawImage: " + arguments.length);
        }

        parent = this.__closestGroupOrSvg();
        currentElement = this.__currentElement;
        var translateDirective = "translate(" + dx + ", " + dy + ")";
        if (image instanceof ctx) {
            //canvas2svg mock canvas context. In the future we may want to clone nodes instead.
            //also I'm currently ignoring dw, dh, sw, sh, sx, sy for a mock context.
            svg = image.getSvg().cloneNode(true);
            if (svg.childNodes && svg.childNodes.length > 1) {
                defs = svg.childNodes[0];
                while(defs.childNodes.length) {
                    id = defs.childNodes[0].getAttribute("id");
                    this.__ids[id] = id;
                    this.__defs.appendChild(defs.childNodes[0]);
                }
                group = svg.childNodes[1];
                if (group) {
                    //save original transform
                    var originTransform = group.getAttribute("transform");
                    var transformDirective;
                    if (originTransform) {
                        transformDirective = originTransform+" "+translateDirective;
                    } else {
                        transformDirective = translateDirective;
                    }
                    group.setAttribute("transform", transformDirective);
                    parent.appendChild(group);
                }
            }
        } else if (image.nodeName === "CANVAS" || image.nodeName === "IMG") {
            //canvas or image
            svgImage = this.__createElement("image");
            svgImage.setAttribute("width", dw);
            svgImage.setAttribute("height", dh);
            svgImage.setAttribute("preserveAspectRatio", "none");

            if (sx || sy || sw !== image.width || sh !== image.height) {
                //crop the image using a temporary canvas
                canvas = this.__document.createElement("canvas");
                canvas.width = dw;
                canvas.height = dh;
                context = canvas.getContext("2d");
                context.drawImage(image, sx, sy, sw, sh, 0, 0, dw, dh);
                image = canvas;
            }
            svgImage.setAttribute("transform", translateDirective);
            svgImage.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href",
                image.nodeName === "CANVAS" ? image.toDataURL() : image.getAttribute("src"));
            parent.appendChild(svgImage);
        }
    };

    /**
     * Generates a pattern tag
     */
    ctx.prototype.createPattern = function (image, repetition) {
        var pattern = this.__document.createElementNS("http://www.w3.org/2000/svg", "pattern"), id = randomString(this.__ids),
            img;
        pattern.setAttribute("id", id);
        pattern.setAttribute("width", image.width);
        pattern.setAttribute("height", image.height);
        if (image.nodeName === "CANVAS" || image.nodeName === "IMG") {
            img = this.__document.createElementNS("http://www.w3.org/2000/svg", "image");
            img.setAttribute("width", image.width);
            img.setAttribute("height", image.height);
            img.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href",
                image.nodeName === "CANVAS" ? image.toDataURL() : image.getAttribute("src"));
            pattern.appendChild(img);
            this.__defs.appendChild(pattern);
        } else if (image instanceof ctx) {
            pattern.appendChild(image.__root.childNodes[1]);
            this.__defs.appendChild(pattern);
        }
        return new CanvasPattern(pattern, this);
    };

    ctx.prototype.setLineDash = function (dashArray) {
        if (dashArray && dashArray.length > 0) {
            this.lineDash = dashArray.join(",");
        } else {
            this.lineDash = null;
        }
    };

    /**
     * Not yet implemented
     */
    ctx.prototype.drawFocusRing = function () {};
    ctx.prototype.createImageData = function () {};
    ctx.prototype.getImageData = function () {};
    ctx.prototype.putImageData = function () {};
    ctx.prototype.globalCompositeOperation = function () {};
    ctx.prototype.setTransform = function () {};

    //add options for alternative namespace
    if (typeof window === "object") {
        window.C2S = ctx;
    }

    // CommonJS/Browserify
    if (typeof module === "object" && typeof module.exports === "object") {
        module.exports = ctx;
    }

}());


function downloadsvg(filename, text) {
  var element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  element.setAttribute('download', filename);

  element.style.display = 'none';
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}

globalInstance.exportSVG = function() {
    //exportWith(SvgWriterContext);
    
    cacheImages(function() {
        var origctx = csctx;
        try {
            csctx = new C2S(csw,csh);
            csctx.width = csw;
            csctx.height = csh;
            updateCindy();
            /*
            var blob = csctx.toBlob();
            exportedCanvasURL = window.URL.createObjectURL(blob);

            downloadHelper(exportedCanvasURL);*/
            //serialize your SVG
          var mySerializedSVG = csctx.getSerializedSvg(); //true here, if you need to convert named to numbered entities.

          //If you really need to you can access the shadow inline SVG created by calling:
          var svg = csctx.getSvg();
          console.log(mySerializedSVG);
          console.log(svg);
          //downloadHelper(mySerializedSVG.to);
          downloadsvg("cdy" + (new Date()).toISOString()+".svg",mySerializedSVG);

        } finally {
            csctx = origctx;
        }
    });
    
};

globalInstance.exportPDF = function() {
    CindyJS.loadScript('pako', 'pako.min.js', function() {
        exportWith(PdfWriterContext);
    });
};

globalInstance.exportPNG = function() {
    downloadHelper(csctx.canvas.toDataURL());
};


var downloadHelper = function(data) {
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.style = "display: none";
    a.href = data;
    a.download = "CindyJSExport";
    a.click();
    setTimeout(function() {
        document.body.removeChild(a);
        releaseExportedObject();
    }, 100);
};
