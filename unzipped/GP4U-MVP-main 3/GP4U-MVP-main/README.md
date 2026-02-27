# GP4U - GPU Rental Marketplace MVP

> **Cross-cloud GPU arbitrage platform with health tracking**

GP4U is a production-quality MVP that combines three powerful features into one platform:

1. **GPU Marketplace** - Browse and rent GPUs across AWS, GCP, Azure, Lambda Labs, and RunPod
2. **Cross-Cloud Arbitrage** - Automatically find the cheapest GPU prices across all providers
3. **GPU Health Tracking** - "CarFax for GPUs" showing thermal health, memory scores, uptime, and usage history

Built to impress investors with a clean, modern UI and real-world functionality.

---

## 🚀 Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** PostgreSQL (Supabase/Neon compatible)
- **ORM:** Prisma
- **Backend:** Next.js Server Actions + Route Handlers

---

## ✨ Features

### 1. GPU Marketplace (`/marketplace`)
- Browse available GPUs across multiple cloud providers
- Filter by provider, GPU model, pricing
- View real-time availability status
- See health scores at a glance
- Click through to detailed GPU pages

### 2. GPU Details + Health (`/gpu/[id]`)
- Comprehensive GPU specifications
- **CarFax-style health report:**
  - Thermal health score (0-100)
  - Memory health score (0-100)
  - Total uptime hours
  - Last maintenance date
  - Historical usage patterns (Training/Inference/Idle)
- Pricing calculator (1hr, 8hr, 24hr, 30-day estimates)
- Direct "Rent this GPU" action

### 3. Cross-Cloud Arbitrage (`/arbitrage`)
- Interactive price comparison calculator
- Input: GPU type, quantity, duration
- Output: Ranked providers by total cost
- Visual highlighting of best deals
- Shows potential savings vs. highest price
- Mock availability indicators

### 4. Job Queue (`/jobs`)
- Create new GPU jobs with:
  - Job name
  - GPU selection
  - Expected duration
  - Script path (optional)
  - Automatic cost estimation
- View all jobs with status tracking
- Job states: PENDING → RUNNING → COMPLETE
- Cost estimates per job

### 5. User Dashboard (`/dashboard`)
- Overview stats:
  - Total spend
  - Jobs run
  - Average job duration
  - Potential savings via arbitrage
- "Best Deal Right Now" recommendation
- Recent jobs list
- Quick action shortcuts
- Usage summary

---

## 📦 Installation & Setup

### Prerequisites
- Node.js 18+ and npm/pnpm
- PostgreSQL database (local or hosted)
  - Supabase: https://supabase.com
  - Neon: https://neon.tech
  - Or local PostgreSQL instance

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/GP4U-MVP.git
cd GP4U-MVP
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your database connection string:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/gp4u?schema=public"
```

**For Supabase:**
```env
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"
```

**For Neon:**
```env
DATABASE_URL="postgresql://[user]:[password]@[endpoint].neon.tech/[dbname]?sslmode=require"
```

### Step 4: Initialize Database

Run Prisma migrations to create the database schema:

```bash
npx prisma migrate dev --name init
```

### Step 5: Seed the Database

Populate the database with mock data (GPUs, health records, demo user, sample jobs):

```bash
npm run prisma:seed
```

This creates:
- 1 demo user (`demo@gp4u.com`)
- 10 GPUs across different providers
- Health records for each GPU
- 3 sample jobs

### Step 6: Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🎯 Using the Application

### Browse the Marketplace
1. Navigate to **Marketplace** in the header
2. View all available GPUs with pricing and health scores
3. Click any GPU card to see full details and health report

### Use the Arbitrage Calculator
1. Navigate to **Arbitrage**
2. Select GPU type (A100-80GB, H100, RTX-4090, etc.)
3. Enter number of GPUs and duration
4. Click **Calculate Prices**
5. View ranked comparison table showing best deals

### Create and Manage Jobs
1. Navigate to **Jobs**
2. Click **Create Job**
3. Fill in:
   - Job name (e.g., "LLM Training - GPT-2")
   - Select a GPU from the dropdown
   - Expected duration in hours
   - (Optional) Script path
4. View estimated cost
5. Click **Create Job**
6. See your job appear in the job list

### View Dashboard
1. Navigate to **Dashboard**
2. See your usage stats:
   - Total spend across all jobs
   - Number of jobs run
   - Average job duration
   - Potential savings
3. Check the "Best Deal Right Now" recommendation
4. View recent jobs
5. Access quick actions

---

## 🗄️ Database Schema

The application uses the following Prisma models:

- **User** - User accounts (currently using a demo user)
- **GPU** - GPU listings with provider, specs, pricing
- **GPUHealth** - Health metrics (thermal, memory, uptime, maintenance)
- **Job** - User jobs with GPU assignment, status, cost
- **ArbitrageSnapshot** - Historical price data for arbitrage

See `prisma/schema.prisma` for the full schema.

---

## 📁 Project Structure

```
GP4U-MVP/
├── app/                      # Next.js App Router
│   ├── api/                  # API routes
│   │   └── jobs/             # Job CRUD endpoints
│   ├── marketplace/          # GPU marketplace page
│   ├── gpu/[id]/            # GPU details page
│   ├── arbitrage/           # Arbitrage calculator
│   ├── jobs/                # Job queue page
│   ├── dashboard/           # User dashboard
│   ├── layout.tsx           # Root layout with navigation
│   ├── page.tsx             # Landing page
│   └── globals.css          # Global styles
├── components/              # React components
│   ├── ui/                  # shadcn/ui components
│   ├── navigation.tsx       # Header navigation
│   ├── gpu-card.tsx         # GPU card component
│   ├── gpu-health-widget.tsx # Health display
│   ├── arbitrage-table.tsx  # Price comparison table
│   ├── job-card.tsx         # Job display card
│   └── dashboard-stats.tsx  # Dashboard statistics
├── lib/                     # Utilities and helpers
│   ├── db.ts               # Prisma client
│   ├── arbitrage.ts        # Arbitrage logic
│   ├── formatters.ts       # Data formatters
│   └── utils.ts            # Utility functions
├── prisma/
│   ├── schema.prisma       # Database schema
│   └── seed.ts             # Seed script
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🎨 Design Philosophy

This MVP follows a **Stripe-like design aesthetic**:
- Clean, modern, minimal interface
- Generous whitespace
- Consistent typography and spacing
- Professional color palette (muted tones, green accents for savings/success)
- Mobile-responsive grid layouts
- Clear visual hierarchy

Built to impress investors while remaining functional and easy to navigate.

---

## 🔧 Development Scripts

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run Prisma migrations
npm run prisma:migrate

# Seed database
npm run prisma:seed

# Open Prisma Studio (database GUI)
npm run prisma:studio

# Lint code
npm run lint
```

---

## 🚀 Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your repository
4. Add environment variables:
   - `DATABASE_URL` (your Postgres connection string)
5. Deploy!

Vercel will automatically:
- Build your Next.js app
- Run Prisma generate
- Deploy to production

**After deployment:**
- Run `npx prisma migrate deploy` in Vercel's terminal to apply migrations
- Run the seed script to populate data (or use Vercel's Postgres dashboard)

### Deploy to Other Platforms

The app is a standard Next.js application and can be deployed to:
- Vercel (recommended)
- Netlify
- Railway
- AWS Amplify
- Any Node.js hosting platform

---

## 🧪 Mock Data & Seeding

All pricing and availability data is currently **mocked** for demo purposes:

- **GPU Pricing:** Hardcoded in `lib/arbitrage.ts`
- **Health Scores:** Generated in seed script
- **Availability:** Randomized during arbitrage calculations
- **User:** Single demo user (`demo@gp4u.com`)

In a production system, you would:
- Integrate real cloud provider APIs (AWS EC2, GCP Compute, Azure VM)
- Pull live pricing from provider APIs
- Track real GPU health via monitoring agents
- Implement proper user authentication

---

## 🔐 Authentication (Current State)

The current MVP uses a **simplified auth model**:
- One demo user (`demo@gp4u.com`) created by the seed script
- All jobs are attributed to this user
- No login/logout flow

**For production:**
- Add Supabase Auth for email/magic-link authentication
- Implement proper session management
- Add user registration flow
- Protect routes with middleware

Auth stubs are clearly marked in the code with `// TODO: Real auth` comments.

---

## 🎯 What Sets GP4U Apart

Unlike other GPU rental platforms, GP4U combines:

1. **Multi-cloud aggregation** - One interface for 5+ providers
2. **Real-time arbitrage** - Automatic price comparison and savings alerts
3. **GPU health transparency** - "CarFax for GPUs" - See the full history and health before you rent
4. **Investor-ready design** - Professional, modern UI that looks production-grade

This isn't just a rental marketplace - it's an **intelligent GPU procurement platform**.

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Database ORM by [Prisma](https://www.prisma.io/)

---

## 📞 Support

For questions or issues:
- Open an issue on GitHub
- Email: support@gp4u.com (if applicable)

---

**Built with ❤️ for investors and early users**

Ready to revolutionize GPU rentals? Let's go! 🚀