
define([], function () {
    return {

        msg: function (ownId, title, detail, ok, cancel, inverse) {
            // This html was found on https://qlik-oss.github.io/leonardo-ui/dialog.html
            if ($('#msgparent_' + ownId).length > 0) $('#msgparent_' + ownId).remove();

            var html = '<div id="msgparent_' + ownId + '">' +
                '  <div class="lui-modal-background"></div>' +
                '  <div class="lui-dialog' + (inverse ? '  lui-dialog--inverse' : '') + '" style="width: 400px;top:80px;">' +
                '    <div class="lui-dialog__header">' +
                '      <div class="lui-dialog__title">' + title + '</div>' +
                '    </div>' +
                '    <div class="lui-dialog__body">' +
                detail +
                '    </div>' +
                '    <div class="lui-dialog__footer">';
            if (cancel) {
                html +=
                    '  <button class="lui-button  lui-dialog__button' + (inverse ? '  lui-button--inverse' : '') + '" ' +
                    '   onclick="$(\'#msgparent_' + ownId + '\').remove();">' +
                    //'   onclick="var elem=document.getElementById(\'msgparent_' + ownId + '\');elem.parentNode.removeChild(elem);">' +
                    cancel +
                    ' </button>'
            }
            if (ok) {
                html +=
                    '  <button class="lui-button  lui-dialog__button  ' + (inverse ? '  lui-button--inverse' : '') + '" id="msgok_' + ownId + '">' +
                    ok +
                    ' </button>'
            };
            html +=
                '     </div>' +
                '  </div>' +
                '</div>';

            if ($("#qs-page-container").length) {
                $("#qs-page-container").append(html);
            } else {
                $('body').append(html);
            }
            // fix for Qlik Sense > July 2021, the dialog gets rendered below the visible part of the screen
            if ($('#msgparent_' + ownId + ' .lui-dialog').position().top > 81) {
                $('#msgparent_' + ownId + ' .lui-dialog').css({
                    'top': (-$('#msgparent_' + ownId + ' .lui-dialog').position().top + 100) + 'px'
                });
            }
        },

        close: function (ownId) {
            $('#msgparent_' + ownId).remove();
        }
    }
})