$("#sourceForm").bind('keypress', function(e) {
    var code = e.keyCode || e.which;
    if (code == 13) { //Enter keycode
        $("#gonow").click()
    }
});

var sourceForm = {
    setBusy: function() {
        var source = getCookie("activeSource");
        $("#sourcehost").prop("readonly", "readonly").prop("value", source.host);
        $("#username").prop("readonly", "readonly").prop("value", source.user);
        $("#password").prop("readonly", "readonly").prop("value", '******');
    },
    setIdle: function() {
        $("#sourcehost").prop("readonly", "");
        $("#username").prop("readonly", "");
        $("#password").prop("readonly", "");
    },
    getValues: function() {
        var host = $("#sourcehost").val();
        var user = $("#username").val();
        var pass = $("#password").val();
        if (host.length == 0 || host == null) {
            $().toastmessage('showErrorToast', 'Feed me a valid site address, plz (e.g., 10.0.0.10.4040)');
            return;
        }
        if (user.length == 0 || user == null) {
            user = "hive";
            $().toastmessage('showWarningToast', 'Use default user [hive].');
        }
        if (pass.length == 0 || pass == null) {
            $().toastmessage('showWarningToast', 'Empty password.');
        }
        return {
            host: host,
            user: user,
            pass: pass
        }
    }
}

// GoNow button
var gonow = {
    setBusy: function() {
        // change to running state
        $("#gonow").removeClass("btn-success").addClass("btn-danger").text("Stop");
        sourceForm.setBusy();
        setCookie("gonowClicked", "true");
        liveData = true;
    },
    setIdle: function() {
        // change to idle state
        $("#gonow").removeClass("btn-danger").addClass("btn-success").text("Go!");
        sourceForm.setIdle();
        setCookie("gonowClicked", "false");
        liveData = false;
        setCookie("activeSource", null);
    },
    isBusy: function() {
        return getCookie('gonowClicked');
    }
};

// GoNow button
$("#gonow").click(function() {
    var sform = sourceForm.getValues();
    var dataForm = {
        host: sform.host,
        action: gonow.isBusy() ? 'unregister' : 'register',
        username: sform.user,
        password: sform.pass,
    };

    $.post('/source', dataForm, "application/json")
        .done(function(rsp) {
            setCookie("activeSource", rsp)
                // change button status
            if ($("#gonow").hasClass('btn-success')) {
                gonow.setBusy();
                $().toastmessage('showNoticeToast', 'Start listening on ' + sform.host);
            } else {
                gonow.setIdle();
                $().toastmessage('showNoticeToast', 'Stop listening on ' + sform.host);
            }
            // window.location.reload() //forcedly
        })
        .fail(function(err) {
            $().toastmessage('showErrorToast', "Bad request.");
        });
});

if (gonow.isBusy()) {
    gonow.setBusy();
    console.log('liveData = ' + liveData)
};
