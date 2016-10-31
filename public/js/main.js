// create table
function createPanelTable() {
    $.getJSON("sources/json", function(data) {
        sources = $.map(data, function(src, key) {
            var status = src.active ? 'glyphicon-eye-open' : 'glyphicon-eye-close';
            var linked = activeSource == src.id ? ' menu-source-link-busy' : '';
            return {
                id: src.id,
                host: '<span class="glyphicon ' + status + '"><span><a style="margin-left: 5px" href=' + src.host + '>' + src.host + '</a>',
                user: src.user.toUpperCase(),
                view: '<div class="menu-source-link text-center' + linked + '" id="' + src.id + '"><span class="glyphicon glyphicon-transfer"></span></div>',
            };
        });
        $table.bootstrapTable('load', sources);
    });
}
