// AREA OF CHANGE: Added profile.js logic for interactive UI elements
$(document).ready(function() {
    initializeProfile();
});

function initializeProfile() {
    // 1. Copy Referral/User ID to Clipboard
    $('.copy-id').on('click', function() {
        const idText = $(this).data('id');
        navigator.clipboard.writeText(idText).then(() => {
            const $btn = $(this);
            const originalHtml = $btn.html();
            
            $btn.html('<i class="fas fa-check"></i> Copied!');
            $btn.addClass('btn-success');
            
            setTimeout(() => {
                $btn.html(originalHtml);
                $btn.removeClass('btn-success');
            }, 2000);
        });
    });

    // 2. Handle Profile Picture Preview (If you add upload functionality later)
    $('#avatarUpload').on('change', function(e) {
        const reader = new FileReader();
        reader.onload = function(e) {
            $('.profile-avatar-big').attr('src', e.target.result);
        }
        reader.readAsDataURL(this.files[0]);
    });

    // 3. Tab Switching (If you decide to split info/security/logs)
    $('.profile-tab').on('click', function() {
        const target = $(this).data('target');
        
        $('.profile-tab').removeClass('active');
        $(this).addClass('active');
        
        $('.profile-section').hide();
        $(`#${target}`).fadeIn();
    });
}