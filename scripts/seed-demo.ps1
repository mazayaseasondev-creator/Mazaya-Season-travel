# Seed demo data into a running Mazaya server (development mode).
#
#   Usage (Windows PowerShell), with the server already running:
#     powershell -ExecutionPolicy Bypass -File scripts\seed-demo.ps1
#   Or just paste the whole file into a second PowerShell window.
#
# It creates leads, customers, and PAID hotel/flight/tour bookings plus a
# visa request, so the admin dashboard shows real numbers. Safe to run again
# (it just adds more).

$base = "http://localhost:4000"

function Post($path, $body, $sess) {
  $json = ($body | ConvertTo-Json -Depth 6 -Compress)
  if ($sess) {
    Invoke-RestMethod -Uri "$base$path" -Method Post -Body $json -ContentType 'application/json' -WebSession $sess
  } else {
    Invoke-RestMethod -Uri "$base$path" -Method Post -Body $json -ContentType 'application/json'
  }
}
function RefOf($checkout) { if ($checkout.payment) { $checkout.payment.ref } else { $checkout.ref } }

Write-Host "Seeding demo data into $base ..." -ForegroundColor Cyan

# --- Public contact-form leads -------------------------------------------------
Post "/api/leads" @{ name="Sara Ahmed";  contact="sara@example.com"; message="Family package to Baku in August." } | Out-Null
Post "/api/leads" @{ name="Khalid Omar"; contact="0501234567";       message="Honeymoon to the Maldives, 5 nights." } | Out-Null
Post "/api/leads" @{ name="Mona Hassan"; contact="mona@example.com"; message="Umrah group of 12, need visas + hotel." } | Out-Null
Write-Host "  3 leads added"

# --- Customers, each with a paid booking --------------------------------------
$people = @(
  @{ email="fatima@example.com"; name="Fatima Noor";  product="hotel"  },
  @{ email="omar@example.com";   name="Omar Said";    product="flight" },
  @{ email="layla@example.com";  name="Layla Karim";  product="tour"   },
  @{ email="yusuf@example.com";  name="Yusuf Ali";    product="hotel"  },
  @{ email="nadia@example.com";  name="Nadia Saleh";  product="visa"   }
)

foreach ($p in $people) {
  # Passwordless login (dev mode returns the OTP in the response)
  $otp  = Post "/api/auth/request-otp" @{ identifier = $p.email }
  $sess = $null
  Invoke-RestMethod -Uri "$base/api/auth/verify-otp" -Method Post -ContentType 'application/json' `
    -Body (@{ identifier = $p.email; code = $otp.devCode } | ConvertTo-Json) -SessionVariable sess | Out-Null

  switch ($p.product) {
    "hotel" {
      $s   = Invoke-RestMethod "$base/api/hotels/search?city=Dubai&checkIn=2026-08-01&checkOut=2026-08-04&guests=2"
      $bk  = Post "/api/hotels/bookings" @{ rateKey=$s.hotels[0].rooms[0].rateKey; leadGuest=$p.name; guests=2 } $sess
      $co  = Post "/api/payments/hotel/$($bk.booking.id)/checkout" @{} $sess
      Post "/api/payments/$(RefOf $co)/confirm" @{} $sess | Out-Null
      Write-Host "  $($p.name): hotel booked + paid"
    }
    "flight" {
      $s   = Invoke-RestMethod "$base/api/flights/search?origin=DXB&destination=LHR&departDate=2026-08-10&adults=1"
      $bk  = Post "/api/flights/bookings" @{ offerKey=$s.offers[0].offerKey; leadPassenger=$p.name } $sess
      $co  = Post "/api/payments/flight/$($bk.booking.id)/checkout" @{} $sess
      Post "/api/payments/$(RefOf $co)/confirm" @{} $sess | Out-Null
      Write-Host "  $($p.name): flight booked + ticketed"
    }
    "tour" {
      $s   = Invoke-RestMethod "$base/api/tours/search?city=Dubai&date=2026-08-10&travellers=2"
      $bk  = Post "/api/tours/bookings" @{ tourKey=$s.tours[0].tourKey; leadTraveller=$p.name; travellers=2 } $sess
      $co  = Post "/api/payments/tour/$($bk.booking.id)/checkout" @{} $sess
      Post "/api/payments/$(RefOf $co)/confirm" @{} $sess | Out-Null
      Write-Host "  $($p.name): tour booked + paid"
    }
    "visa" {
      $vt = (Invoke-RestMethod "$base/api/visa-types").visaTypes[0].code
      Post "/api/visas" @{ visaTypeCode=$vt; applicantName=$p.name; nationality="United Arab Emirates"; passportNumber="A1234567" } $sess | Out-Null
      Write-Host "  $($p.name): visa request submitted"
    }
  }
}

Write-Host ""
Write-Host "Done. Refresh http://localhost:4000/admin/ to see the data." -ForegroundColor Green
