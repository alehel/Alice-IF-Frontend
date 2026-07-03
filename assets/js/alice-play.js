/* AlicePlay — boots the Z-machine and dresses the room.
 *
 * Wiring: ZVM (ifvms.js) is the engine, GlkApi/GlkOte the stagehands,
 * AliceDialog the butler who fetches and carries the files.
 */

'use strict';

window.AlicePlay = (function($) {

    var config = null;
    var toast_timer = null;
    var scroll_button = null;   /* "Transcript" button, made on demand */
    var scroll_key = null;

    function toast(html, sticky) {
        var el = document.getElementById('alice-toast');
        if (!el) return;
        el.innerHTML = html;
        el.classList.add('shown');
        if (toast_timer) clearTimeout(toast_timer);
        if (!sticky)
            toast_timer = setTimeout(function() { el.classList.remove('shown'); }, 6500);
    }

    function fatal(message) {
        var pane = document.getElementById('errorpane');
        var content = document.getElementById('errorcontent');
        var loading = document.getElementById('loadingpane');
        if (loading) loading.style.display = 'none';
        if (content) content.innerHTML = message;
        if (pane) pane.style.display = '';
    }

    /* Put a command on the player's pen and press Enter, as a courtesy
       for the toolbar buttons. Typing it works just the same. */
    function type_command(cmd) {
        var input = $('#gameport input.Input').last();
        if (!input.length || input.prop('disabled')) {
            toast('The story is not asking for a command just now — ' +
                  'press <em>space</em> or answer its question first.');
            return;
        }
        input.val(cmd);
        var ev = $.Event('keypress');
        ev.which = 13;
        ev.keyCode = 13;
        input.trigger(ev);
        moves_since_save++;
    }

    var moves_since_save = 0;

    function wire_page() {
        var save = document.getElementById('btn-save');
        var restore = document.getElementById('btn-restore');
        if (save) save.addEventListener('click', function() { type_command('save'); });
        if (restore) restore.addEventListener('click', function() { type_command('restore'); });

        /* Don't let an hour of Wonderland vanish on a stray click:
           once there is unsaved progress, leaving asks first. */
        var gameport = document.getElementById('gameport');
        if (gameport) {
            gameport.addEventListener('keypress', function(ev) {
                if ((ev.which || ev.keyCode) === 13)
                    moves_since_save++;
            }, true);
        }
        window.addEventListener('beforeunload', function(ev) {
            if (moves_since_save >= 3) {
                ev.preventDefault();
                ev.returnValue = '';
            }
        });

        document.addEventListener('alice-file-saved', function(ev) {
            moves_since_save = 0;
            toast('A bookmark fell into your Downloads folder.' +
                  '<span class="file">' + ev.detail.filename + '</span>');
        });

        document.addEventListener('alice-restore-open', function() {
            toast('Choose a bookmark file to hand back…');
        });

        document.addEventListener('alice-bad-bookmark', function(ev) {
            toast('That file is not a bookmark from this book — ' +
                  'choose a <em>.sav</em> file that was saved here.' +
                  '<span class="file">' + ev.detail.filename + '</span>');
        });

        document.addEventListener('alice-restore-closed', function(ev) {
            var el = document.getElementById('alice-toast');
            if (el) el.classList.remove('shown');
            /* give the pen back to the player */
            setTimeout(function() { $('#gameport input.Input').last().focus(); }, 50);
        });

        /* a transcript or command-recording is growing: offer it once */
        document.addEventListener('alice-scroll-kept', function(ev) {
            scroll_key = ev.detail.key;
            if (scroll_button) return;
            var actions = document.querySelector('.binding .actions');
            if (!actions) return;
            scroll_button = document.createElement('button');
            scroll_button.type = 'button';
            scroll_button.textContent = 'Transcript';
            scroll_button.title = 'Download the transcript kept so far';
            scroll_button.addEventListener('click', function() {
                var name = window.AliceDialog.download_kept(scroll_key);
                if (name)
                    toast('The scroll fell into your Downloads folder.' +
                          '<span class="file">' + name + '</span>');
            });
            actions.appendChild(scroll_button);
            toast('A scroll is being kept of everything said. ' +
                  'Fetch it with the <em>Transcript</em> button above.');
        });
    }

    function start() {
        var vm = new window.ZVM();
        var options = {
            vm: vm,
            Glk: window.Glk,
            GlkOte: window.GlkOte,
            Dialog: window.AliceDialog,
            gameport: 'gameport',
            windowport: 'windowport',
            spacing: 0,
            exit_warning: 'The dream is over — reload the page to fall down the rabbit-hole again.'
        };

        fetch(config.story, { cache: 'default' })
            .then(function(resp) {
                if (!resp.ok)
                    throw new Error('the story file could not be fetched (HTTP ' + resp.status + ')');
                return resp.arrayBuffer();
            })
            .then(function(buf) {
                vm.prepare(new Uint8Array(buf), options);
                window.Glk.init(options);
            })
            .catch(function(err) {
                fatal('<strong>“Curiouser and curiouser!”</strong><br>' +
                      'Wonderland could not be reached: ' + err.message +
                      '<br>(If you opened this page straight from a file, serve it ' +
                      'over HTTP instead — e.g. <code>python3 -m http.server</code>.)');
            });
    }

    function boot(cfg) {
        config = cfg || {};
        window.AliceDialog.configure({ basename: config.save_basename || 'alice' });

        document.addEventListener('DOMContentLoaded', function() {
            wire_page();

            /* GlkOte measures the font's metrics at init; make sure it
               measures Garamond, not the fallback serif. */
            var ready = (document.fonts && document.fonts.load)
                ? Promise.all([
                      document.fonts.load('19px "EB Garamond"'),
                      document.fonts.load('italic 19px "EB Garamond"'),
                      document.fonts.load('700 21px "Playfair Display"')
                  ]).catch(function() { })
                : Promise.resolve();

            ready.then(start);
        });
    }

    return { boot: boot };

})(jQuery);
