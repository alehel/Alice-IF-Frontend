/* AliceDialog — a Dialog implementation for GlkOte/GlkApi 2.3.x
 *
 * Replaces the stock dialog.js (browser-storage file manager) with the
 * behaviour this site wants:
 *
 *   SAVE     -> the Quetzal save file is downloaded straight into the
 *               player's Downloads folder, no questions asked.
 *   RESTORE  -> a native file picker opens so the player can hand a
 *               previously downloaded save back.
 *   SCRIPT / RECORDING -> kept in memory while they grow (a transcript is
 *               flushed every few seconds — downloading each flush would
 *               rain files on the player); the page is told about them via
 *               events and offers a single download instead.
 *   data files -> persisted quietly in localStorage.
 *
 * Interface contract: GlkOte 2.3.7 dialog.js (non-streaming), i.e.
 * open(), file_construct_ref(), file_construct_temp_ref(),
 * file_clean_fixed_name(), file_ref_exists(), file_remove_ref(),
 * file_write(), file_read(), autosave_read/write(), init/inited/getlibrary.
 */

'use strict';

window.AliceDialog = (function() {

    var GlkOteRef = null;
    var basename = 'alice';          /* stem for downloaded filenames */

    /* Files written or uploaded during this session, keyed by
       usage + ':' + filename. Values are { content, israw }. */
    var memfiles = {};

    var STORAGE_PREFIX = 'alicetales:file:';

    var EXTENSIONS = {
        save: '.sav',
        transcript: '.txt',
        command: '.rec',
        data: '.dat'
    };

    function memkey(ref) {
        return (ref.usage || 'xxx') + ':' + ref.filename;
    }

    function storagekey(ref) {
        return STORAGE_PREFIX + memkey(ref);
    }

    function timestamp() {
        var d = new Date();
        function p(n) { return (n < 10 ? '0' : '') + n; }
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
            + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    }

    function announce(type, detail) {
        try {
            document.dispatchEvent(new CustomEvent(type, { detail: detail }));
        }
        catch (ex) { /* decorative only */ }
    }

    /* Turn stored content (an array of byte values for binary files,
       an array of char codes for text files) into a Blob. */
    function content_to_blob(content, usage) {
        if (typeof content === 'string')
            return new Blob([content], { type: 'text/plain;charset=utf-8' });
        content = content || [];
        if (usage === 'save' || usage === 'data') {
            return new Blob([new Uint8Array(content)], { type: 'application/octet-stream' });
        }
        /* text usages: values are unicode code points */
        var text = '';
        for (var ix = 0; ix < content.length; ix++)
            text += String.fromCharCode(content[ix]);
        return new Blob([text], { type: 'text/plain;charset=utf-8' });
    }

    function download(ref, content) {
        var ext = EXTENSIONS[ref.usage] || '.dat';
        var name = ref.filename + (ref.filename.indexOf('.') < 0 ? ext : '');
        var blob = content_to_blob(content, ref.usage);
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 4000);
        return name;
    }

    /* ---- the Dialog interface ------------------------------------ */

    function dialog_init(iface) {
        if (iface && iface.GlkOte)
            GlkOteRef = iface.GlkOte;
        if (!GlkOteRef)
            GlkOteRef = window.GlkOte;
    }

    function dialog_inited() {
        return (GlkOteRef != null);
    }

    function dialog_get_library(val) {
        switch (val) {
            case 'GlkOte': return GlkOteRef;
        }
        return null;
    }

    /* open(tosave, usage, gameid, callback)
       The game asked for a file by prompt. Writing: mint a fileref at
       once — the eventual file_write() does the downloading. Reading:
       raise a native file picker and wrap whatever the player chooses. */
    function dialog_open(tosave, usage, gameid, callback) {
        if (tosave) {
            var ref = {
                filename: basename + '-' + timestamp(),
                usage: usage,
                gameid: gameid
            };
            /* async, as a click on a real dialog would be */
            setTimeout(function() { callback(ref); }, 0);
            return;
        }

        /* --- reading: let the player hand a bookmark back --- */
        var input = document.createElement('input');
        input.type = 'file';
        if (usage === 'save')
            input.accept = '.sav,.glksave,.qzl,.quetzal,application/octet-stream';
        input.style.cssText = 'position:fixed;left:-1000px;top:0;opacity:0;';
        document.body.appendChild(input);

        var done = false;
        function finish(ref) {
            if (done) return;
            done = true;
            if (input.parentNode)
                input.parentNode.removeChild(input);
            announce('alice-restore-closed', { chosen: !!ref });
            callback(ref);
        }

        input.addEventListener('change', function() {
            var file = input.files && input.files[0];
            if (!file)
                return finish(null);
            var reader = new FileReader();
            reader.onload = function() {
                var bytes = new Uint8Array(reader.result);
                /* A saved game must be a Quetzal file (an IFF 'FORM').
                   Refusing junk here keeps the engine from a fatal stop —
                   the game just says the restore failed. */
                if (usage === 'save' && !(bytes.length > 12
                    && bytes[0] === 0x46 && bytes[1] === 0x4F
                    && bytes[2] === 0x52 && bytes[3] === 0x4D)) {
                    finish(null);
                    announce('alice-bad-bookmark', { filename: file.name });
                    return;
                }
                var content = [];
                for (var ix = 0; ix < bytes.length; ix++)
                    content.push(bytes[ix]);
                var ref = {
                    filename: file.name,
                    usage: usage,
                    uploaded: true
                };
                memfiles[memkey(ref)] = { content: content };
                finish(ref);
            };
            reader.onerror = function() { finish(null); };
            reader.readAsArrayBuffer(file);
        });

        /* the picker was dismissed without a file */
        input.addEventListener('cancel', function() { finish(null); });

        /* belt and braces for browsers without the cancel event: when
           focus returns to the page and no change has fired shortly
           after, treat it as a cancel */
        window.addEventListener('focus', function onfocus() {
            window.removeEventListener('focus', onfocus);
            setTimeout(function() {
                if (!done && !(input.files && input.files.length))
                    finish(null);
            }, 1200);
        });

        announce('alice-restore-open', { usage: usage });
        input.click();
    }

    /* Construct a fileref for a filename the game supplied itself. */
    function file_construct_ref(filename, usage, gameid) {
        return {
            filename: filename || '',
            usage: usage || '',
            gameid: gameid || ''
        };
    }

    function file_construct_temp_ref(usage) {
        return {
            filename: '_temp_' + (new Date().getTime()) + '_' + Math.floor(Math.random() * 10000),
            usage: usage,
            temp: true
        };
    }

    /* Mirrors stock dialog.js: fixed names are cleaned conservatively. */
    function file_clean_fixed_name(filename, usage) {
        var res = String(filename || '').replace(/["/\\<>:|?*]/g, '');
        var pos = res.indexOf('.');
        if (pos >= 0)
            res = res.slice(0, pos);
        if (!res.length)
            res = 'null';
        return res;
    }

    function file_ref_exists(ref) {
        if (memfiles[memkey(ref)])
            return true;
        try {
            if (localStorage.getItem(storagekey(ref)) !== null)
                return true;
        }
        catch (ex) { }
        return false;
    }

    function file_remove_ref(ref) {
        delete memfiles[memkey(ref)];
        try { localStorage.removeItem(storagekey(ref)); }
        catch (ex) { }
    }

    /* The game wrote a file (this fires on stream close, and every few
       seconds for a stream that stays open, e.g. a running transcript). */
    function file_write(ref, content, israw) {
        memfiles[memkey(ref)] = { content: content, israw: israw };

        /* GlkApi truncates a just-opened file by writing a raw empty
           string. That is bookkeeping, not a file to deliver. */
        if (israw && (content === '' || content == null))
            return true;

        if (ref.usage === 'save' && !ref.temp) {
            var name = download(ref, content);
            announce('alice-file-saved', { filename: name, usage: 'save' });
            return true;
        }

        if (ref.usage === 'transcript' || ref.usage === 'command') {
            /* no download per flush — the page offers a button instead */
            announce('alice-scroll-kept', {
                usage: ref.usage,
                key: memkey(ref),
                length: (content && content.length) || 0
            });
            return true;
        }

        /* data files and temp files: keep quietly */
        if (!ref.temp) {
            try { localStorage.setItem(storagekey(ref), JSON.stringify(content)); }
            catch (ex) { /* quota — the in-memory copy still works this session */ }
        }
        return true;
    }

    function file_read(ref, israw) {
        var mem = memfiles[memkey(ref)];
        if (mem)
            return mem.content;
        try {
            var stored = localStorage.getItem(storagekey(ref));
            if (stored !== null)
                return JSON.parse(stored);
        }
        catch (ex) { }
        return null;
    }

    function file_notimplemented() {
        throw new Error('AliceDialog: streaming is not supported');
    }

    /* No VM autosave on this site: an explicit SAVE is the bookmark. */
    function autosave_write(signature, snapshot) { }
    function autosave_read(signature) { return null; }

    /* ---- site-facing helpers -------------------------------------- */

    /* Called by the page to set the download filename stem. */
    function configure(opts) {
        if (opts && opts.basename)
            basename = String(opts.basename);
    }

    /* Download a kept transcript/recording by its announce()d key. */
    function download_kept(key) {
        var mem = memfiles[key];
        if (!mem) return null;
        var sep = key.indexOf(':');
        var ref = { usage: key.slice(0, sep), filename: key.slice(sep + 1) };
        return download(ref, mem.content);
    }

    return {
        classname: 'Dialog',
        version: '2.3.7-alice',
        streaming: false,

        init: dialog_init,
        inited: dialog_inited,
        getlibrary: dialog_get_library,

        open: dialog_open,

        file_clean_fixed_name: file_clean_fixed_name,
        file_construct_ref: file_construct_ref,
        file_construct_temp_ref: file_construct_temp_ref,
        file_ref_exists: file_ref_exists,
        file_remove_ref: file_remove_ref,
        file_write: file_write,
        file_read: file_read,

        file_fopen: file_notimplemented,

        autosave_write: autosave_write,
        autosave_read: autosave_read,

        /* extensions used by alice-play.js */
        configure: configure,
        download_kept: download_kept
    };

})();
