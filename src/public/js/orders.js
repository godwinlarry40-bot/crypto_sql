$(document).ready(function() {
    let allOrders = [];

    function renderTable(data) {
        const $tbody = $('#orders-tbody');
        if (data.length === 0) {
            $tbody.html('<tr><td colspan="6" class="text-center">No matching investment records found.</td></tr>');
            return;
        }

        let html = '';
        data.forEach(item => {
            const date = new Date(item.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            const maturity = new Date(item.end_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            
            html += `
                <tr>
                    <td>${date}</td>
                    <td><span style="color:var(--accent-color)">${item.plan ? item.plan.name : 'Standard'}</span></td>
                    <td><strong>$${parseFloat(item.amount).toLocaleString()}</strong></td>
                    <td style="color:var(--success)">+${item.interest_rate}%</td>
                    <td>${maturity}</td>
                    <td><span class="status-pill status-${item.status}">${item.status.toUpperCase()}</span></td>
                </tr>
            `;
        });
        $tbody.html(html);
    }

    // START: AJAX Fetching Logic
    function fetchOrders() {
        const token = localStorage.getItem('token');
        $.ajax({
            url: '/api/investments/my-investments',
            type: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
            success: function(res) {
                if (res.success) {
                    allOrders = res.data;
                    renderTable(allOrders);
                }
            },
            error: function() {
                $('#orders-tbody').html('<tr><td colspan="6" class="text-center" style="color:var(--danger)">Session expired. Please log in again.</td></tr>');
            }
        });
    }
    // END: AJAX Logic

    // START: Filter Button Logic
    $('.filter-btn').on('click', function() {
        $('.filter-btn').removeClass('active');
        $(this).addClass('active');
        
        const status = $(this).data('status');
        if (status === 'all') {
            renderTable(allOrders);
        } else {
            const filtered = allOrders.filter(o => o.status === status);
            renderTable(filtered);
        }
    });
    // END: Filter Logic

    fetchOrders();
});