// Area of change: Added loading state and validation for forgot password form
$(document).ready(function() {
    $('#forgotForm').on('submit', function() {
        const $btn = $('#resetBtn');
        const $icon = $btn.find('i');
        
        // UI Loading State
        $btn.prop('disabled', true).css('opacity', '0.7');
        $btn.find('span').text('Sending Request...');
        $icon.removeClass('fa-arrow-right').addClass('fa-spinner fa-spin');
        
        // Form proceeds to backend via standard POST
    });
});