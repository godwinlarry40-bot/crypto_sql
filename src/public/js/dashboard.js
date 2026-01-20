$(document).ready(function() {
    function refreshPortfolio() {
        const token = localStorage.getItem('token');

        $.ajax({
            url: '/api/dashboard/stats',
            type: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
            success: function(response) {
                if (response.success) {
                    const stats = response.data;
                    
                    // START: Updating UI with actual database values
                    $('#total-balance').text(`$${stats.total_balance}`);
                    $('#active-investments').text(`$${stats.active_investments}`);
                    $('#total-profit').text(`+$${stats.total_profit}`);
                    // END: Updating UI
                }
            },
            error: function(err) {
                console.error("Dashboard Sync Error:", err);
            }
        });
    }

    // Run on page load
    refreshPortfolio();
});