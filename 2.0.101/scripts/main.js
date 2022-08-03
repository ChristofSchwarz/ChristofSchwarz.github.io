define([
    "jquery", "jquery-ui", "../quill/quill", 'leonardo-msg',
    "text!../tour-props.html", "text!../tooltip-props.html", "text!../help-texts.json"
], function
    ($, ui, Quill, leonardo, tourPropsHTML, tooltipPropsHTML, helpTextsRaw) {

    const autoSave = false;  // tour calls save method on change of every <input> and <select> element
    const origin = '*';
    const language = 'en';
    const triggerElements = ['input', 'select'];

    // parse query-strings 
    var log = document.location.search.split('log=')[1];
    if (log) log = log.split('&')[0];
    if (log == 'false') log = false;
    if (log == 'true') log = true;

    // replace any {{key?}} with the respective helptext key / language from help-texts.json
    const helpTexts = JSON.parse(helpTextsRaw);
    for (const helpKey in helpTexts) {
        console.log(helpKey, helpTexts[helpKey])
        tourPropsHTML = tourPropsHTML.replace(`{{${helpKey}}}`
            , `<span class="lui-icon  lui-icon--help" title="${helpTexts[helpKey][language]}"></span>`);
        tooltipPropsHTML = tooltipPropsHTML.replace(`{{${helpKey}}}`
            , `<span class="lui-icon  lui-icon--help" title="${helpTexts[helpKey][language]}"></span>`);
    };

    window.top.postMessage({ msg: 'editorReady' }, origin);
    setTimeout(function () { $('#wait4msg').show(); }, 2000);

    window.onmessage = function (event) {
        if (log) console.log('Tour Editor got message', event.data);

        if (event.data.msg == 'putToDOM') {

            $('#wait4msg').remove();

            var tourJson = event.data.tourJson;
            // const storageProvider = event.data.storageProvider;
            // const tour = event.data.tour;
            // const app = event.data.app;
            // const log = event.data.log;

            // enable accordion
            $('#tab-1').css('height', (window.innerHeight - 75) + 'px');

            $('#tab-1-accordion').append(tourPropsHTML);
            $('#gtour-editor-info').text(location.href); // put info from where the editor was opened into div tag

            // make accordion  functional 
            $(function () {
                $("#tab-1-accordion").accordion({ heightStyle: "fill" });
            });

            // Make tab UI activated using below script  
            var $tabs = $('#tabs').tabs();

            tourJsonIntoDOM(tourJson);

            triggerElements.forEach(function (tag) {
                console.log('register ', `.gtour-tabs #1 ${tag}`);
                $(`#tab-1 ${tag}`).on('change', function () {
                    console.log('change');
                    mayBeChangeVisibility(1);
                })
            })
            mayBeChangeVisibility(1);

            if (autoSave) autoSaveOnEvents('#tab-1-accordion');

            $('.gtour-tabs #1').click(function () {
                // try to close preview of tooltip

                window.top.postMessage({ msg: 'closePreview' }, origin);

            })

            $("#addTab").click(function () {
                addTab(true);
            });

            // Here we are making jQuery Tabs (li tag) Sortable  
            $(function () {
                $("#tabs ul").sortable({ containment: "#tabs ul" });
                $("#tabs ul").disableSelection();
            });

            // We can get sort order directly once you done sort by drag & drop  
            $("#tabs ul").bind("sortupdate", function (event, ui) {
                event.stopPropagation();
            });

            addColorPicker('bgcolor', '', 'black');
            addColorPicker('fontcolor', '', 'white');
            addColorPicker('bordercolor', '', 'white');
            $('#tabs').show();

        } else if (event.data.msg == 'getTourJson') {
            //
            const activeTab = $('.ui-tabs-active').attr('id');
            const selector = $('#tab-' + activeTab + '-accordion [key="selector"]').val();
            // received request to return the new tourJson from main extension 
            window.top.postMessage({
                msg: event.data.nextMsg,
                tourJson: DOMtoTourJson(),
                activeTab: activeTab,
                selector: selector
            }, origin);

        } else if (event.data.msg == 'pasteSelector') {

            const activeTab = $('.ui-tabs-active').attr('id');
            $('#tab-' + activeTab + '-accordion [key="selector"]').val(event.data.selector);
            // unmark selection button (remove class picker-active)
            $('.picker-active').removeClass('picker-active');

        }
    }


    //-------------------------------------------------------------------------------------
    function delay(millis) {
        // usage: await delay(20); to wait 20 millisecs
        return new Promise(function (resolve, reject) {
            setTimeout(function () { resolve() }, millis)
        })
    };
    /*
    function expertMode() {
        alert('expert Mode');
    }
    */

    function autoSaveOnEvents(selector) {
        // registers a on-change event on relevant html-tags and triggers an auto-save
        triggerElements.forEach(function (tag) {

            $(selector + ' ' + tag).on('change', function () {
                // store.saveTour(tour, storageProvider, store.createTourJson('#tabs'), app);
                window.top.postMessage({
                    msg: 'autoSave',
                    tourJson: DOMtoTourJson()
                }, origin);
            });
        })
    }

    function addColorPicker(selector, newid, defaultColor) {
        const acp = AColorPicker.createPicker(`#${selector}-picker${newid}`, {
            showHEX: true,
            showHSL: false,
            palette: "PALETTE_MATERIAL_CHROME"
        })
            .on('change', function (picker, color) {
                $(`#inp-${selector}${newid}`).val(color);
            });
        acp.toggle(); // hide after first rendering

        $(`#btn-${selector}${newid}`).click(function () {
            // adjust the position of acolorpicker

            const newTop = $(`#inp-${selector}${newid}`).position().top + $(`#inp-${selector}${newid}`).height() + 10;
            const newLeft = $(`#btn-${selector}${newid}`).position().left - 232;
            $(`#${selector}-picker${newid}`).css({ "top": newTop + 'px', "left": newLeft + 'px', "z-index": 20 });
            acp.setColor($(`#inp-${selector}${newid}`).val() || defaultColor);
            const isHidden = $(`#${selector}-picker${newid} .a-color-picker`).hasClass('hidden');
            $('.a-color-picker').addClass('hidden'); // hide all other color pickers;
            if (isHidden) {
                acp.show();  // show or hide
            } else {
                if (autoSave) {
                    // store.saveTour(tour, storageProvider, store.createTourJson('#tabs'), app);
                    window.top.postMessage({
                        msg: 'autoSave',
                        tourJson: DOMtoTourJson()
                    }, origin);
                }
            }

        });
    }

    async function addTab(selectAfterCreation) {
        // Here we are getting max id so that we can assing new id to new tab  
        var maxid = 0;
        const tabName = $('.ui-tabs-nav li').length;
        $('#tabs ul li').each(function () {
            var value = parseInt($(this).attr('id'));
            maxid = (value > maxid) ? value : maxid;
        });

        var newid = maxid + 1;

        // Adding new "<li>" with anchor tag  

        $('.gtour-tabs').append(
            '<li id="' + newid + '">'
            + '<a href="#tab-' + newid + '">' + tabName + '</a>'
            + '<span class="lui-icon lui-icon--close lui-icon--small gtour-remove-tab"></span>'
            + '</li>'
        );

        // register click event
        $(`#${newid} .gtour-remove-tab`).on('click', function () {
            removeTabs();
        })

        // Adding Div for content for the above "li" tag  
        $("#tabs").append(
            '<div style="display:none;" id="tab-' + newid + '">' +
            '  <div id="tab-' + newid + '-accordion"></div>' +
            '</div>'
        );
        $('#tab-' + newid).css('height', (window.innerHeight - 75) + 'px');
        $('#tab-' + newid + '-accordion').append(tooltipPropsHTML.replace(/{{newid}}/g, newid));

        $('#gtour-picker-' + newid).click(function () {
            if ($('#gtour-picker-' + newid).hasClass('picker-active')) {
                $('#gtour-picker-' + newid).removeClass('picker-active');
                window.top.postMessage({
                    msg: 'quitPicker',
                    // activeTab: newid
                }, origin);
            } else {
                $('#gtour-picker-' + newid).addClass('picker-active');
                window.top.postMessage({
                    msg: 'startPicker',
                    // activeTab: newid
                }, origin);
            }
        });

        $('#tab-' + newid + '-accordion .action_types').append(`
            <option value="select" selected>Select field value</option>
            <option value="clear">Clear field selection</option>
            <option value="clear-all">Clear all selections</option>
            <option value="variable">Set variable</option>
            <option value="goto-sheet">Go to sheet</option>
        `);

        addColorPicker('bgcolor', newid, 'black');
        addColorPicker('fontcolor', newid, 'white');

        // Activate accordion functionality
        $(function () {
            $("#tab-" + newid + "-accordion").accordion({ heightStyle: 'fill' /*'content' ,'fill', 'auto' */ });
        });
        // Refreshing the tab as we have just added new tab  
        $("#tabs").tabs("refresh");

        // height of accordion section doesn't work correctly here, set height like on tab 1
        // wait until new tab is rendered in DOM
        while (!$('#tab-' + newid + '-accordion .ui-accordion-content:first').height()) {
            await delay(10);
        }
        const heightTab1Sections = $('#tab-1-accordion .ui-accordion-content:first').height();
        //console.warn('heightTab1Sections', heightTab1Sections);
        if (heightTab1Sections) {
            $('#tab-' + newid + '-accordion .ui-accordion-content').css('height', (heightTab1Sections - 35) + 'px');
        }
        var quill = new Quill('#quill-editor-' + newid, {
            theme: 'snow',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                    ['bold', 'italic', 'underline'],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    //[{ align: [] }, { indent: '-1' }, { indent: '+1' }],
                    // ['blockquote', 'code-block']
                    ['link', 'image', 'code-block'],
                    [{ color: [] }, { background: [] }]
                ],
                // htmlEditButton: {}
            }
        });

        // register auto-preview when the tab will be clicked
        $('.gtour-tabs #' + newid).on('click', function () {
            //console.log('try to preview ' + newid);
            if ($('#tab-2 [key="selector"]').val()) {
                //$('.gtour-preview-tooltip', window.parent.document).trigger('click');
                const activeTab = $('.ui-tabs-active').attr('id');
                const selector = $('#tab-' + activeTab + '-accordion [key="selector"]').val();
                window.top.postMessage({
                    msg: 'previewTooltip',
                    tourJson: DOMtoTourJson(),
                    activeTab: activeTab,
                    selector: selector
                }, origin);

            }
            $('.a-color-picker').addClass('hidden'); // hide all other color pickers;

        });

        if (autoSave) autoSaveOnEvents(`#tab-${newid}-accordion`);

        triggerElements.forEach(function (tag) {
            console.log('register ', `.gtour-tabs #${newid} ${tag}`);
            $(`#tab-${newid} ${tag}`).on('change', function () {
                console.log('change');
                mayBeChangeVisibility(newid);
            })
        })
        mayBeChangeVisibility(newid);

        // Make added tab active  
        if (selectAfterCreation) {
            $("#tabs").find('li a[href="#tab-' + newid + '"]').trigger("click");
        }


    }


    function removeTabs() {
        var tabIndex = $("#tabs .ui-tabs-panel:visible").attr("id");

        // Confirm from user that he/she sure wants to delete this active tab  
        leonardo.msg('luimsg', 'Delete Tooltip',
            "Are you sure want to delete selected tooltip?", 'Yes', 'No', false);
        $('#msgok_luimsg').on('click', function () {
            // Find name of Tab by attribute id  
            // Removing Li and as well as content Div for the specific Tab  
            $("#tabs").find(".ui-tabs-nav li a[href='#" + tabIndex + "']").parent().remove();
            $("#tabs").find("div[id=" + tabIndex + "]").remove();

            window.top.postMessage({ msg: 'closePreview' }, origin);  // close preview tooltip

            // One removing process done we refresh the tab again  
            $("#tabs").tabs("refresh");
            leonardo.close('luimsg');
        })
    }

    async function tourJsonIntoDOM(tourJson) {

        // The opposite function (make a tourJson from the HTML DOM) is in store.js !

        console.log('tourJson', tourJson);
        // create the (yet empty) tabs at once
        tourJson.tooltips.forEach(function (e) {
            addTab(false);
        });

        var tab = 1;
        for (const tourKey in tourJson) {
            // iterate over all keys in Json object
            if (tourKey == 'tooltips') {
                for (const tooltip of tourJson.tooltips) {
                    // iterate through tooltip array
                    //addTab();
                    tab++;
                    for (const tooltipKey in tooltip) {
                        // iterate through all keys of every tooltip object
                        //console.log('Tooltip key/val', tooltipKey, tooltip[tooltipKey]);
                        if (tooltipKey == 'html') {
                            // special key "html" is directly set to the Quill editor's div content
                            // wait until Quill editor is rendered in DOM
                            while ($('#quill-editor-' + tab + ' .ql-editor').length == 0) {
                                await delay(10);
                            }
                            $('#quill-editor-' + tab + ' .ql-editor').html(tooltip[tooltipKey]);
                        } else {
                            //$editor('#tab-' + tab + ' [key="' + tooltipKey + '"]').val(tooltip[tooltipKey]);
                            // special handling if the key is a boolean
                            if (tooltip[tooltipKey] == true || tooltip[tooltipKey] == false) {
                                // this is a type checkbox field
                                $('#tab-' + tab + ' [key="' + tooltipKey + '"]').prop('checked', tooltip[tooltipKey]);
                            } else {
                                $('#tab-' + tab + ' [key="' + tooltipKey + '"]').val(tooltip[tooltipKey]);
                            }
                        }
                    }
                }
            } else {
                console.log('Tour key/val', tourKey, tourJson[tourKey]);
                // set respective input field to value
                $('#tab-1 [key="' + tourKey + '"]').val(tourJson[tourKey]);
            }
            // select tab 1
            $('#1 a').trigger('click');
        }

    }

    function DOMtoTourJson() {

        // iterate over the relevant DOM elements of the Tour Editor and
        // compose the tourJson.
        // The opposite function (fill the HTML DOM from tourJson) is in main.js !

        var tabArr = [];
        $('.gtour-tabs li').each(function (i, e) {
            tabArr.push($(e).attr('id'));
        })
        // console.log(tabArr);
        var tourJson = { tooltips: [] };

        // iterate through the tabs and compose the Json from the input fields
        for (const tab of tabArr) {
            var tooltipJson = {};
            $('#tab-' + tab + ' [key]').each(function (i, e) {
                // get all input values that have a "key" attribute in HTML
                const key = $(this).attr('key');
                var val;
                if ($(this).is('input')) {  // input field
                    if ($(this).attr('type') == "checkbox") {
                        // if it is a checkbox, the result is a boolean (ckecked or not)
                        val = $(this).is(':checked');
                    } else if ($(this).attr('type') == "number") {
                        // if type is number, the value will be made a Float
                        val = parseFloat($(this).val());
                    } else {
                        val = $(this).val();
                    }
                } else if ($(this).is('select')) {
                    // element is a dropdown-select, get the value of the selected option
                    val = $(this).find('option').filter(':selected').val();
                } else {
                    alert('DOM element unknown how to parse ' + JSON.stringify($this));
                }
                // console.log('Tab ' + tab, key, val);
                if (tab == 1) {
                    tourJson[key] = val;
                } else {
                    tooltipJson[key] = val;
                }
            });
            // console.log('done iterating tab' + tab, tourJson, tooltipJson);
            if (tab != 1) {
                tooltipJson.html = $('#quill-editor-' + tab + ' .ql-editor').html();
                tourJson.tooltips.push(tooltipJson);
            }
        }
        //console.log('tourJson', JSON.stringify(tourJson));

        //const tooltipText = $('.ql-editor').html();
        return tourJson;

    }

    function mayBeChangeVisibility(tooltipIdx) {

        console.log(`mayBeChangeVisibility(${tooltipIdx})`);

        //const key = function (key) { return `[key="${key}"]` };
        const key = function (key) { return `#tab-${tooltipIdx} [key="${key}"]` };
        const cl = '.gtour-td';
        const dis = 'gtour-disable';

        // hide dependency of "mode" selection
        switch ($(key('mode')).val()) {
            case 'click':
                $(key('autoLaunchCond')).closest(cl).addClass(dis);
                $(key('relaunchAfter')).closest(cl).addClass(dis);
                break;
            case 'auto-once':
                $(key('autoLaunchCond')).closest(cl).removeClass(dis);
                $(key('relaunchAfter')).closest(cl).removeClass(dis);
                break;
            case 'auto-always':
                $(key('autoLaunchCond')).closest(cl).removeClass(dis);
                $(key('relaunchAfter')).closest(cl).addClass(dis);
                break;
        }

        // if ($(key('lookupDataModel')).prop('checked')) {
        //     $(key('fieldWithId')).closest(cl).removeClass(dis);
        //     $(key('fieldWithText')).closest(cl).removeClass(dis);
        //     $(key('languageAsRow')).closest(cl).removeClass(dis);
        //     if ($(key('languageAsRow')).prop('checked')) {
        //         $(key('fieldWithLanguage')).closest(cl).removeClass(dis);
        //     } else {
        //         $(key('fieldWithLanguage')).closest(cl).addClass(dis);
        //     }
        // } else {
        //     $(key('fieldWithId')).closest(cl).addClass(dis);
        //     $(key('fieldWithText')).closest(cl).addClass(dis);
        //     $(key('languageAsRow')).closest(cl).addClass(dis);
        //     $(key('fieldWithLanguage')).closest(cl).addClass(dis);
        // }

        // when highlight is checked unhide additional params
        if ($(key('highlight')).prop('checked')) {
            $(key('highlightattr')).closest(cl).removeClass(dis);
            $(key('highlightvalue')).closest(cl).removeClass(dis);
            $(key('otherSelector')).closest(cl).removeClass(dis);
        } else {
            $(key('highlightattr')).closest(cl).addClass(dis);
            $(key('highlightvalue')).closest(cl).addClass(dis);
            $(key('otherSelector')).closest(cl).addClass(dis);
        }

        for (var i = 1; i <= 3; i++) {
            if ($(key(`action${i}_use`)).prop('checked')) {
                $(key(`action${i}_timing`)).closest(cl).removeClass(dis);
                $(key(`action${i}_type`)).closest(cl).removeClass(dis);
                switch ($(key(`action${i}_type`)).val()) {
                    case 'select':
                        $(key(`action${i}_field`)).closest(cl).removeClass(dis);
                        $(key(`action${i}_var`)).closest(cl).addClass(dis);
                        $(key(`action${i}_value`)).closest(cl).removeClass(dis);
                        $(key(`action${i}_sheet`)).closest(cl).addClass(dis);
                        break;
                    case 'clear':
                        $(key(`action${i}_field`)).closest(cl).removeClass(dis);
                        $(key(`action${i}_var`)).closest(cl).addClass(dis);
                        $(key(`action${i}_value`)).closest(cl).addClass(dis);
                        $(key(`action${i}_sheet`)).closest(cl).addClass(dis);
                        break;
                    case 'clear-all':
                        $(key(`action${i}_field`)).closest(cl).addClass(dis);
                        $(key(`action${i}_var`)).closest(cl).addClass(dis);
                        $(key(`action${i}_value`)).closest(cl).addClass(dis);
                        $(key(`action${i}_sheet`)).closest(cl).addClass(dis);
                        break;
                    case 'variable':
                        $(key(`action${i}_field`)).closest(cl).addClass(dis);
                        $(key(`action${i}_var`)).closest(cl).removeClass(dis);
                        $(key(`action${i}_value`)).closest(cl).removeClass(dis);
                        $(key(`action${i}_sheet`)).closest(cl).addClass(dis);
                        break;
                    case 'goto-sheet':
                        $(key(`action${i}_field`)).closest(cl).addClass(dis);
                        $(key(`action${i}_var`)).closest(cl).addClass(dis);
                        $(key(`action${i}_value`)).closest(cl).addClass(dis);
                        $(key(`action${i}_sheet`)).closest(cl).removeClass(dis);
                        break;
                }
            } else {
                $(key(`action${i}_timing`)).closest(cl).addClass(dis);
                $(key(`action${i}_type`)).closest(cl).addClass(dis);
                $(key(`action${i}_field`)).closest(cl).addClass(dis);
                $(key(`action${i}_var`)).closest(cl).addClass(dis);
                $(key(`action${i}_value`)).closest(cl).addClass(dis);
                $(key(`action${i}_sheet`)).closest(cl).addClass(dis);
            }
        }
    }
})
