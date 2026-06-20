$BASE = "http://localhost:4040"
$PASS_COUNT = 0; $FAIL_COUNT = 0; $WARN_COUNT = 0
$RESULTS = New-Object System.Collections.ArrayList

function Test-Step {
  param([string]$Name, $Result, $Expected, [string]$Data="")
  $ok = ($Result -eq $Expected)
  $icon = if ($ok) { "OK  " } else { "FAIL" }
  Write-Host "  [$icon] $Name  [got:$Result expected:$Expected] $Data"
  if ($ok) { $script:PASS_COUNT++ } else { $script:FAIL_COUNT++ }
  [void]$script:RESULTS.Add([PSCustomObject]@{ Step=$Name; Status=if($ok){"PASS"}else{"FAIL"}; Got=$Result; Expected=$Expected; Info=$Data })
}

function Warn-Step {
  param([string]$Name, [string]$Msg)
  Write-Host "  [WARN] $Name -- $Msg"
  $script:WARN_COUNT++
  [void]$script:RESULTS.Add([PSCustomObject]@{ Step=$Name; Status="WARN"; Got=$Msg; Expected="-"; Info="" })
}

function Invoke-API {
  param([string]$Method, [string]$Path, $Body=$null, $Headers=@{})
  $url = "$BASE$Path"
  try {
    $p = @{ Uri=$url; Method=$Method; ContentType="application/json"; ErrorAction="Stop"; UseBasicParsing=$true }
    if ($Body)    { $p.Body    = ($Body | ConvertTo-Json -Depth 10 -Compress) }
    if ($Headers.Count -gt 0) { $p.Headers = $Headers }
    $r = Invoke-WebRequest @p
    $content = $r.Content
    $data = $null
    if ($content) {
      $data = $content | ConvertFrom-Json -ErrorAction SilentlyContinue
      if ($null -eq $data) { $data = $content }
    }
    return @{ ok=$true; data=$data; status=$r.StatusCode }
  } catch {
    $code = 500
    try { $code = [int]$_.Exception.Response.StatusCode }  catch {}
    $msg = $null
    try {
      $rawStream = $_.Exception.Response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($rawStream)
      $rawBody = $reader.ReadToEnd()
      $msg = $rawBody | ConvertFrom-Json -ErrorAction SilentlyContinue
      if ($null -eq $msg) { $msg = @{ message=$rawBody } }
    } catch {}
    return @{ ok=$false; data=$msg; status=$code }
  }
}

Write-Host ""
Write-Host "=================================================="
Write-Host "  SahaVahan Full Pipeline E2E Test"
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "=================================================="
Write-Host ""

# ---- DETECT ADMIN ----
$ADMIN_USER = ""
$ADMIN_TOKEN = ""
foreach ($a in @("admin_browser_test","Admin","admin","sysadmin","nani","Nani","jagapathi","superadmin")) {
  $lu = Invoke-API "GET" "/api/profile/$a"
  if ($lu.ok -and $lu.data.role -eq "admin") { 
    $ADMIN_USER = $lu.data.username
    $lResp = Invoke-API "POST" "/api/users/login" @{ username=$ADMIN_USER; password="TestPass1234" }
    if ($lResp.ok -and $lResp.data.token) {
      $ADMIN_TOKEN = $lResp.data.token
      break
    }
  }
}
Write-Host "Admin detected: $(if($ADMIN_USER){$ADMIN_USER}else{'NONE -- admin tests skipped'})"
Write-Host ""

# ---- UNIQUE TIMESTAMP ----
$TS = [int64](([datetime]::UtcNow)-(Get-Date "1970-01-01")).TotalSeconds
$DRIVER_UN = "drv_$TS"
$DRIVER_EM = "drv_$TS@test.com"
$PASS_UN   = "pax_$TS"
$PASS_EM   = "pax_$TS@test.com"
$PASS_PW   = "TestPass1234"

Write-Host "=== PHASE 1: SIGNUP & EMAIL VERIFICATION ==="
$drvSignup = Invoke-API "POST" "/api/users/signup" @{ username=$DRIVER_UN; email=$DRIVER_EM; phoneNumber="+919876543001"; password=$PASS_PW }
$DRIVER_CODE = $drvSignup.data.uniqueCode
$DRIVER_OTP = (node scratch/get-otp.js $DRIVER_EM).Trim()
Test-Step "Driver Signup" $drvSignup.status 200 "code=$DRIVER_CODE  otp=$DRIVER_OTP"

$paxSignup = Invoke-API "POST" "/api/users/signup" @{ username=$PASS_UN; email=$PASS_EM; phoneNumber="+919876543002"; password=$PASS_PW }
$PAX_CODE = $paxSignup.data.uniqueCode
$PAX_OTP = (node scratch/get-otp.js $PASS_EM).Trim()
Test-Step "Passenger Signup" $paxSignup.status 200 "code=$PAX_CODE  otp=$PAX_OTP"

$drvVerify = Invoke-API "POST" "/api/users/verify-email" @{ email=$DRIVER_EM; otp=$DRIVER_OTP }
Test-Step "Driver Email Verify" $drvVerify.status 200 "msg=$($drvVerify.data.message)"

$paxVerify = Invoke-API "POST" "/api/users/verify-email" @{ email=$PASS_EM; otp=$PAX_OTP }
Test-Step "Passenger Email Verify" $paxVerify.status 200 "msg=$($paxVerify.data.message)"
Write-Host ""

Write-Host "=== PHASE 2: LOGIN ==="
$drvLogin = Invoke-API "POST" "/api/users/login" @{ username=$DRIVER_UN; password=$PASS_PW }
$DRIVER_TOKEN = $drvLogin.data.token
Test-Step "Driver Login" $drvLogin.status 200 "role=$($drvLogin.data.role)"

$paxLogin = Invoke-API "POST" "/api/users/login" @{ username=$PASS_UN; password=$PASS_PW }
$PAX_TOKEN = $paxLogin.data.token
Test-Step "Passenger Login" $paxLogin.status 200 "role=$($paxLogin.data.role)"
Write-Host ""

Write-Host "=== PHASE 3: PROFILE & KYC CHECKS ==="
$drvProfile = Invoke-API "GET" "/api/profile/$DRIVER_UN"
Test-Step "Driver Profile Fetch" $drvProfile.status 200 "isEmailVerified=$($drvProfile.data.isEmailVerified) verifStatus=$($drvProfile.data.verificationStatus)"

$profileComp = Invoke-API "GET" "/api/profile/completion/$DRIVER_UN"
Test-Step "Profile Completion" $profileComp.status 200 "percent=$($profileComp.data.percentage)%"

$profileStats = Invoke-API "GET" "/api/profile/stats/$DRIVER_UN"
Test-Step "Profile Stats" $profileStats.status 200 "published=$($profileStats.data.published) booked=$($profileStats.data.booked)"
Write-Host ""

Write-Host "=== PHASE 4: VEHICLE ADDITION ==="
$plateNum = "AP39AB$((Get-Random -Max 9999).ToString('D4'))"
$addVehicle = Invoke-API "POST" "/api/vehicles/add" @{
  username="$DRIVER_UN"; vehicleType="Car"; vehicleModel="Maruti Swift"
  vehicleNumber=$plateNum; vehicleColor="White"; acAvailable=$true
}
Test-Step "Add Vehicle" $addVehicle.status 200 "msg=$($addVehicle.data.message)"

$getVehicles = Invoke-API "GET" "/api/vehicles/$DRIVER_UN"
Test-Step "Fetch Vehicles" $getVehicles.status 200 "count=$((@($getVehicles.data)).Count)"
$VEHICLE_ID = if ($getVehicles.ok -and (@($getVehicles.data)).Count -gt 0) { (@($getVehicles.data))[0]._id } else { $null }
Write-Host "      VehicleID: $VEHICLE_ID"
Write-Host ""

Write-Host "=== PHASE 5: DRIVER KYC SUBMISSION & APPROVAL ==="
$verifStatus1 = Invoke-API "GET" "/api/driver-verification/status/$DRIVER_UN"
Test-Step "Verif Status (pre-submit)" $verifStatus1.status 200 "status=$($verifStatus1.data.status)"

$submitVerif = Invoke-API "POST" "/api/driver-verification/submit" @{
  username=$DRIVER_UN
  drivingLicense="https://res.cloudinary.com/demo/image/upload/sample_dl.jpg"
  rcBook="https://res.cloudinary.com/demo/image/upload/sample_rc.jpg"
  insurance="https://res.cloudinary.com/demo/image/upload/sample_ins.jpg"
  pollutionCertificate="https://res.cloudinary.com/demo/image/upload/sample_pc.jpg"
  selfieImage="https://res.cloudinary.com/demo/image/upload/sample_selfie.jpg"
}
Test-Step "Submit Driver Verification" $submitVerif.status 201 "msg=$($submitVerif.data.message)"

if ($ADMIN_USER -and $ADMIN_TOKEN) {
  $aHdr = @{ "Authorization"="Bearer $ADMIN_TOKEN" }
  $aPendVerif = Invoke-API "GET" "/api/admin/verification-requests" -Headers $aHdr
  Test-Step "Admin Pending Verifications" $aPendVerif.status 200 "pending=$((@($aPendVerif.data)).Count)"
  
  $verifObj = if ($aPendVerif.ok) { @($aPendVerif.data) | Where-Object { $_.username -eq $DRIVER_UN } } else { $null }
  $VERIF_ID = if ($verifObj) { $verifObj._id } else { $null }
  
  if ($VERIF_ID) {
    $approveVerif = Invoke-API "POST" "/api/admin/verify-driver" @{ verificationId=$VERIF_ID; decision="Approved" } -Headers $aHdr
    Test-Step "Admin Approve Driver Verification" $approveVerif.status 200 "msg=$($approveVerif.data.message)"
  } else {
    Warn-Step "Admin Approve Driver Verification" "Could not find pending verification request for $DRIVER_UN"
  }
} else {
  Warn-Step "Admin KYC Approval" "No admin user found to approve verification"
}

$verifStatus2 = Invoke-API "GET" "/api/driver-verification/status/$DRIVER_UN"
Test-Step "Verif Status (post-approve)" $verifStatus2.status 200 "status=$($verifStatus2.data.status)"
Write-Host ""

Write-Host "=== PHASE 6: ADMIN OPERATIONS ==="
if ($ADMIN_USER -and $ADMIN_TOKEN) {
  $aHdr = @{ "Authorization"="Bearer $ADMIN_TOKEN" }

  $aStats = Invoke-API "GET" "/api/admin/stats" -Headers $aHdr
  Test-Step "Admin Stats" $aStats.status 200 "users=$($aStats.data.users) rides=$($aStats.data.rides) bookings=$($aStats.data.bookings) revenue=$($aStats.data.revenue)"

  $aUsers = Invoke-API "GET" "/api/admin/users" -Headers $aHdr
  Test-Step "Admin All Users" $aUsers.status 200 "count=$((@($aUsers.data)).Count)"

  $aRides = Invoke-API "GET" "/api/admin/rides" -Headers $aHdr
  Test-Step "Admin All Rides" $aRides.status 200 "count=$((@($aRides.data)).Count)"

  $aBooks = Invoke-API "GET" "/api/admin/bookings" -Headers $aHdr
  Test-Step "Admin All Bookings" $aBooks.status 200 "count=$((@($aBooks.data)).Count)"

  $aFraud = Invoke-API "GET" "/api/admin/fraud-users" -Headers $aHdr
  Test-Step "Admin Fraud Detection" $aFraud.status 200 "flagged=$((@($aFraud.data)).Count)"

  $aAnalytics = Invoke-API "GET" "/api/admin/analytics" -Headers $aHdr
  Test-Step "Admin Analytics" $aAnalytics.status 200 "users=$($aAnalytics.data.stats.users)"

  $aReports = Invoke-API "GET" "/api/admin/reports" -Headers $aHdr
  Test-Step "Admin Reports" $aReports.status 200 "count=$((@($aReports.data)).Count)"

  $aSuspend = Invoke-API "POST" "/api/admin/user/suspend/$PASS_UN" -Headers $aHdr
  Test-Step "Admin Suspend User" $aSuspend.status 200 ""

  $aUnsuspend = Invoke-API "POST" "/api/admin/user/unsuspend/$PASS_UN" -Headers $aHdr
  Test-Step "Admin Unsuspend User" $aUnsuspend.status 200 ""
} else {
  Warn-Step "Admin Phase" "No admin user -- skipping admin tests"
}
Write-Host ""

Write-Host "=== PHASE 7: PUBLISH RIDE ==="
$rideDate = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$pubRide = Invoke-API "POST" "/api/rides/publish" @{
  username="$DRIVER_UN"; uniqueCode=$DRIVER_CODE
  source="Vijayawada"; destination="Hyderabad"
  sourceLat=16.5062; sourceLng=80.6480
  pickupLocation=@{ lat=16.5062; lng=80.6480 }
  dropLocation=@{ lat=17.3850; lng=78.4867 }
  date=$rideDate; time="08:00"; seats=3; price=350
  stops=@(); isRecurring=$false; vehicleId=$VEHICLE_ID
  phoneNumber="+919876543001"
}

$RIDE_CODE = $null
$RIDE_ID = $null

if ($pubRide.ok) {
  $RIDE_CODE = $pubRide.data.rideCode
  Test-Step "Publish Ride" $pubRide.status 201 "rideCode=$RIDE_CODE"
  
  # Fetch published ride by uniqueCode to find the ride details and ID
  $driverRides = Invoke-API "GET" "/api/rides/user/$DRIVER_CODE"
  Test-Step "Driver Rides List" $driverRides.status 200 "count=$((@($driverRides.data)).Count)"
  
  $rideObj = if ($driverRides.ok) { @($driverRides.data) | Where-Object { $_.rideCode -eq $RIDE_CODE } } else { $null }
  $RIDE_ID = if ($rideObj) { $rideObj._id } else { $null }
  
  $statusText = if ($RIDE_ID) { "Retrieved" } else { "Failed" }
  Test-Step "Retrieve Published Ride ID" $statusText "Retrieved" "ID=$RIDE_ID"
} else {
  Test-Step "Publish Ride" $pubRide.status 201 "err=$($pubRide.data.message)"
}

$allRides = Invoke-API "GET" "/api/rides/all"
Test-Step "All Rides Feed" $allRides.status 200 "total=$((@($allRides.data)).Count)"

$priceRec = Invoke-API "GET" "/api/rides/recommended-price/Vijayawada/Hyderabad"
Test-Step "Recommended Price" $priceRec.status 200 "price=$($priceRec.data.recommendedPrice)"

$demandScore = Invoke-API "GET" "/api/rides/demand/Vijayawada/Hyderabad"
Test-Step "Demand Score" $demandScore.status 200 "demand=$($demandScore.data.demand)"
Write-Host ""

Write-Host "=== PHASE 8: BOOK RIDE ==="
$BOOKING_ID = $null
$BOARD_OTP = $null
$DROP_OTP_VAL = $null

if ($RIDE_ID) {
  $bookRide = Invoke-API "POST" "/api/rides/book" @{
    rideId="$RIDE_ID"
    bookedBy="$PASS_UN"
    bookedByCode=$PAX_CODE
    publishedBy="$DRIVER_UN"
    seatsBooked=1
    totalPrice=350
  }
  Test-Step "Book Ride" $bookRide.status 200 "msg=$($bookRide.data.message)"
  
  # Fetch booked rides for passenger to get the actual booking ID, boardingOTP, and dropOTP
  $paxBookings = Invoke-API "GET" "/api/rides/booked/$PAX_CODE"
  Test-Step "Passenger Bookings List" $paxBookings.status 200 "count=$((@($paxBookings.data)).Count)"
  
  $bookingObj = if ($paxBookings.ok) { @($paxBookings.data) | Where-Object { $_.rideId -eq $RIDE_ID } } else { $null }
  if ($bookingObj) {
    $BOOKING_ID = $bookingObj._id
    $BOARD_OTP = $bookingObj.boardingOTP
    $DROP_OTP_VAL = $bookingObj.dropOTP
    Test-Step "Retrieve Booking ID & OTPs" "Retrieved" "Retrieved" "BookingID=$BOOKING_ID BoardOTP=$BOARD_OTP DropOTP=$DROP_OTP_VAL"
  } else {
    Test-Step "Retrieve Booking ID & OTPs" "Failed" "Retrieved" "Could not find booking record"
  }

  if ($BOOKING_ID) {
    try {
      $ticketHttp = Invoke-WebRequest -Uri "$BASE/api/rides/ticket/$BOOKING_ID" -Method GET -UseBasicParsing -ErrorAction Stop
      Test-Step "Ride Ticket PDF" $ticketHttp.StatusCode 200 "contentType=$($ticketHttp.Headers['Content-Type'])"
    } catch {
      Warn-Step "Ride Ticket PDF" "Failed to fetch: $_"
    }
  }
} else {
  Warn-Step "Book Ride" "Skipped -- No Ride published successfully"
}
Write-Host ""

Write-Host "=== PHASE 9: BOARDING OTP ==="
if ($BOOKING_ID -and $BOARD_OTP) {
  $boardOtpResp = Invoke-API "POST" "/api/rides/verify-boarding-otp" @{
    bookingId=$BOOKING_ID; otp=$BOARD_OTP; username=$PASS_UN
  } -Headers @{ "Authorization" = "Bearer $DRIVER_TOKEN" }
  Test-Step "Verify Boarding OTP" $boardOtpResp.status 200 "$($boardOtpResp.data.message)"
} else {
  Warn-Step "Boarding OTP" "Skipped -- BookingID=$BOOKING_ID BoardOTP=$BOARD_OTP"
}
Write-Host ""

Write-Host "=== PHASE 10: START RIDE ==="
if ($RIDE_ID) {
  $startRide = Invoke-API "PUT" "/api/rides/start/$RIDE_ID" @{ username=$DRIVER_UN } -Headers @{ "Authorization" = "Bearer $DRIVER_TOKEN" }
  Test-Step "Start Ride" $startRide.status 200 "$($startRide.data.message)"

  $rideStatus = Invoke-API "GET" "/api/rides/status/$RIDE_ID"
  Test-Step "Ride Status Check" $rideStatus.status 200 "status=$($rideStatus.data.status)"
} else {
  Warn-Step "Start Ride" "Skipped -- No ride to start"
}
Write-Host ""

Write-Host "=== PHASE 11: DROP OTP ==="
if ($BOOKING_ID -and $DROP_OTP_VAL) {
  $dropOtpResp = Invoke-API "POST" "/api/rides/verify-drop-otp" @{
    bookingId=$BOOKING_ID; otp=$DROP_OTP_VAL; username=$PASS_UN
  } -Headers @{ "Authorization" = "Bearer $DRIVER_TOKEN" }
  Test-Step "Verify Drop OTP" $dropOtpResp.status 200 "$($dropOtpResp.data.message)"
} else {
  Warn-Step "Drop OTP" "Skipped -- BookingID=$BOOKING_ID DropOTP=$DROP_OTP_VAL"
}
Write-Host ""

Write-Host "=== PHASE 12: COMPLETE RIDE ==="
if ($RIDE_ID) {
  $completeRide = Invoke-API "PUT" "/api/rides/complete/$RIDE_ID" @{ username=$DRIVER_UN } -Headers @{ "Authorization" = "Bearer $DRIVER_TOKEN" }
  Test-Step "Complete Ride" $completeRide.status 200 "$($completeRide.data.message)"
} else {
  Warn-Step "Complete Ride" "Skipped -- No ride to complete"
}
Write-Host ""

Write-Host "=== PHASE 13: DASHBOARD STATS & HISTORY ==="
$dashResp = Invoke-API "GET" "/api/dashboard/stats/$DRIVER_CODE"
Test-Step "Driver Stats Dashboard" $dashResp.status 200 "published=$($dashResp.data.totalPublished) booked=$($dashResp.data.totalBooked)"

$paxDash = Invoke-API "GET" "/api/dashboard/stats/$PAX_CODE"
Test-Step "Passenger Stats Dashboard" $paxDash.status 200 "published=$($paxDash.data.totalPublished) booked=$($paxDash.data.totalBooked)"

$drvHistory = Invoke-API "GET" "/api/dashboard/history/$DRIVER_UN"
Test-Step "Driver History Feed" $drvHistory.status 200 "records=$((@($drvHistory.data)).Count)"
Write-Host ""

Write-Host "=== PHASE 14: REVIEWS ==="
if ($BOOKING_ID) {
  $addReview = Invoke-API "POST" "/api/reviews/add" @{
    rideId=$RIDE_ID; reviewer=$PASS_UN; reviewedUser=$DRIVER_UN; rating=5; comment="Excellent service! Safe drive."
  }
  Test-Step "Add Review" $addReview.status 201 "msg=$($addReview.data.message)"
}

$getReviews = Invoke-API "GET" "/api/reviews/user/$DRIVER_UN"
Test-Step "Fetch Reviews" $getReviews.status 200 "count=$((@($getReviews.data)).Count)"
Write-Host ""

Write-Host "=== PHASE 15: LEADERBOARD & NOTIFICATIONS ==="
$lb = Invoke-API "GET" "/api/leaderboard/drivers"
Test-Step "Leaderboard" $lb.status 200 "entries=$((@($lb.data)).Count)"

$notifs = Invoke-API "GET" "/api/notifications/$DRIVER_UN"
Test-Step "Driver Notifications" $notifs.status 200 "count=$((@($notifs.data)).Count)"

$paxNotifs = Invoke-API "GET" "/api/notifications/$PASS_UN"
Test-Step "Passenger Notifications" $paxNotifs.status 200 "count=$((@($paxNotifs.data)).Count)"
Write-Host ""

Write-Host "=== PHASE 16: PLATFORM ANALYTICS ==="
$homeStats = Invoke-API "GET" "/api/analytics/home-stats"
Test-Step "Home Stats" $homeStats.status 200 "users=$($homeStats.data.totalUsers) rides=$($homeStats.data.totalRides)"

$popRoutes = Invoke-API "GET" "/api/analytics/popular-routes"
Test-Step "Popular Routes" $popRoutes.status 200 "count=$((@($popRoutes.data)).Count)"

$hallFame = Invoke-API "GET" "/api/analytics/hall-of-fame"
Test-Step "Hall of Fame" $hallFame.status 200 ""

$forecast = Invoke-API "GET" "/api/forecast/$DRIVER_UN"
Test-Step "Revenue Forecast" $forecast.status 200 "prediction=$($forecast.data.prediction)"

$envImpact = Invoke-API "GET" "/api/environment/impact?username=$DRIVER_UN"
Test-Step "Env Impact" $envImpact.status 200 "co2Saved=$($envImpact.data.co2Saved)"
Write-Host ""

Write-Host "=== PHASE 17: SOS & REPORTS ==="
$sosResp = Invoke-API "POST" "/api/sos/trigger" @{ username=$DRIVER_UN; lat=16.5062; lng=80.6480; rideId=$RIDE_ID }
Test-Step "SOS Alert" $sosResp.status 200 "msg=$($sosResp.data.message)"

$reportResp = Invoke-API "POST" "/api/reports/create" @{
  reportedBy=$PASS_UN; reportedUser=$DRIVER_UN; reason="Test report -- automated test"
}
Test-Step "Submit Report" $reportResp.status 200 "msg=$($reportResp.data.message)"
Write-Host ""

Write-Host "=== PHASE 18: PASSWORD CHANGE ==="
$changePw = Invoke-API "POST" "/api/users/change-password" @{
  username=$DRIVER_UN; currentPassword=$PASS_PW; newPassword="NewSecure9876"
}
Test-Step "Change Password" $changePw.status 200 "msg=$($changePw.data.message)"
Write-Host ""

Write-Host "=== PHASE 19: ADMIN CLEANUP ==="
if ($ADMIN_USER -and $ADMIN_TOKEN -and $RIDE_ID) {
  $aHdr2 = @{ "Authorization"="Bearer $ADMIN_TOKEN" }
  $delRide = Invoke-API "DELETE" "/api/admin/ride/$RIDE_ID" -Headers $aHdr2
  Test-Step "Admin Delete Test Ride" $delRide.status 200 "msg=$($delRide.data.message)"
}
Write-Host ""

Write-Host "=================================================="
Write-Host "  FINAL TEST RESULTS"
Write-Host "=================================================="
Write-Host ""
Write-Host "  PASSED  : $PASS_COUNT"
Write-Host "  FAILED  : $FAIL_COUNT"
Write-Host "  WARNINGS: $WARN_COUNT"
Write-Host "  TOTAL   : $($PASS_COUNT+$FAIL_COUNT+$WARN_COUNT)"
Write-Host ""
$pct = if (($PASS_COUNT+$FAIL_COUNT) -gt 0) { [math]::Round($PASS_COUNT/($PASS_COUNT+$FAIL_COUNT)*100,1) } else { 0 }
Write-Host "  PASS RATE: $pct%"
Write-Host ""
Write-Host "Test User Credentials:"
Write-Host "  Driver   : $DRIVER_UN / NewSecure9876"
Write-Host "  Passenger: $PASS_UN / $PASS_PW"
Write-Host ""
$failed = $RESULTS | Where-Object { $_.Status -eq "FAIL" }
if ($failed.Count -gt 0) {
  Write-Host "FAILED STEPS:"
  $failed | Format-Table Step,Got,Expected,Info -AutoSize
}
Write-Host "=================================================="
