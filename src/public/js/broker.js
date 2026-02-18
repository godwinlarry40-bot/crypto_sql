const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=false';

$(document).ready(function() {
    const $sidebar = $('#sidebar');
    const $hamburgerBtn = $('#hamburgerBtn');
    const $sidebarOverlay = $('#sidebarOverlay');

    // Area of change: AJAX setup to include tokens if you are using JWT auth
    $.ajaxSetup({
        beforeSend: function(xhr) {
            const token = localStorage.getItem('token');
            if (token) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }
        }
    });

    // --- SIDEBAR & DROPDOWN ---
    function initSidebar() {
        $hamburgerBtn.on('click', function(e) {
            e.stopPropagation();
            $sidebar.toggleClass('active');
            $sidebarOverlay.toggleClass('active');
        });

        $sidebarOverlay.on('click', function() {
            $sidebar.removeClass('active');
            $(this).removeClass('active');
        });

        $('.dropbtn').on('click', function(e) {
            e.preventDefault();
            $(this).next('.dropdown-menu').slideToggle();
        });
    }

    // --- LOGOUT ---
    function initSignOut() {
        $('#headerLogoutBtn, #sidebarLogoutBtn').on('click', function(e) {
            if (confirm('Are you sure you want to sign out?')) {
                localStorage.clear();
                window.location.href = '/login';
            }
        });
    }

    // --- LIVE DATA REFRESH ---
    // Area of change: Function to periodically refresh stats without reloading page
    async function refreshDashboardStats() {
        try {
            const data = await $.ajax({
                url: '/api/user/stats', // Your backend endpoint
                method: 'GET'
            });
            
            $('#total-balance').text(`$${data.balance.toLocaleString()}`);
            $('#active-investments').text(`$${data.investments.toLocaleString()}`);
            $('#total-profit').text(`+$${data.profit.toLocaleString()}`);
        } catch (err) {
            console.error("Dashboard refresh failed", err);
        }
    }

    initSidebar();
    initSignOut();
    
    // Refresh user stats every 60 seconds
    setInterval(refreshDashboardStats, 60000);
});