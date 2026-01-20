$(document).ready(function() {
    
    // 1. Sidebar Navigation Switcher
    $('.nav-item').on('click', function() {
        const targetSection = $(this).data('section');
        $('.nav-item').removeClass('active');
        $(this).addClass('active');
        $('.settings-section').removeClass('active').hide();
        $(`#${targetSection}`).fadeIn(300).addClass('active');
    });

    // 2. 2FA Toggle Display
    $('#enable2fa').on('change', function() {
        if(this.checked) {
            alert("Security Update: Please scan the QR code in your authenticator app to continue.");
        }
    });

    // 3. Profile Save Handler
    $('#saveProfile').on('click', async function(e) {
        e.preventDefault();
        const $btn = $(this);
        const originalText = $btn.html();
        const $status = $('#profile-status');
        
        $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Saving...');

        const profileData = {
            fullName: $('#fullName').val(),
            email: $('#email').val()
        };

        try {
            // Area of change: Added real endpoint call for profile
            const response = await axios.post('/settings/update/profile', profileData);
            showStatus($status, response.data.message, '#10b981');
        } catch (err) {
            showStatus($status, 'Error updating profile.', '#ef4444');
        } finally {
            $btn.prop('disabled', false).html(originalText);
        }
    });

    // Area of change: Renamed ID to btnUpdateSecurity and added stopImmediatePropagation to kill login script interference
    $('#btnUpdateSecurity').on('click', async function(e) {
        e.preventDefault();
        e.stopImmediatePropagation(); // This stops any other script from running on this button

        const $btn = $(this);
        const originalText = $btn.html();
        const $status = $('#security-status');

        const currentPassword = $('#currentPassword').val();
        const newPassword = $('#newPassword').val();
        const confirmPwd = $('#confirmPassword').val();

        if (!currentPassword) {
            showStatus($status, 'Please enter current password', '#ef4444');
            return;
        }

        if (newPassword && newPassword !== confirmPwd) {
            showStatus($status, 'New passwords do not match!', '#ef4444');
            return;
        }

        $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Securing...');

        try {
            // Area of change: Corrected endpoint and payload keys to match web.js
            const response = await axios.post('/api/auth/change-password', { 
                old_password: currentPassword, 
                new_password: newPassword 
            });

            showStatus($status, response.data.message, '#10b981');
            $('#currentPassword, #newPassword, #confirmPassword').val('');
        } catch (err) {
            // Area of change: Correctly capturing the "Current password incorrect" message from server
            const msg = err.response ? err.response.data.message : 'Failed to update security.';
            showStatus($status, msg, '#ef4444');
        } finally {
            $btn.prop('disabled', false).html(originalText);
        }
    });

    function showStatus($el, msg, color) {
        $el.text(msg).css({'color': color, 'display': 'block', 'margin-top': '10px'}).fadeIn();
        setTimeout(() => $el.fadeOut(), 4000);
    }

    // 4. Payment Method Switcher
    $('.p-tab').on('click', function() {
        $('.p-tab').css({'background': '#fff', 'color': '#333', 'border': '1px solid #ddd'}).removeClass('active');
        $(this).addClass('active').css({'background': '#e0f7fa', 'color': '#00bcd4', 'border': '1px solid #00bcd4'});
    });

    // Theme Selection Logic
    $('.theme-option').on('click', function() {
        $('.theme-option').removeClass('active').css('border', '1px solid #ddd');
        $(this).addClass('active').css('border', '2px solid #00bcd4');
        const selectedTheme = $(this).text().trim().toLowerCase();
        if(selectedTheme === 'dark') {
            $('body').addClass('dark-theme').css('background-color', '#0d1b2a');
        } else if(selectedTheme === 'light') {
            $('body').removeClass('dark-theme').css('background-color', '#f4f6f8');
        }
    });

    $('.slider-range').on('input', function() {
        $('body').css('font-size', $(this).val() + 'px');
    });
});