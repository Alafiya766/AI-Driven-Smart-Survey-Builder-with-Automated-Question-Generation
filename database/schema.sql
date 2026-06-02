-- ============================================================
--  QueryCraft Database Schema  (v2 — 3 Roles + Templates)
--  Roles: admin | creator | respondent
-- ============================================================

CREATE DATABASE IF NOT EXISTS querycraft CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE querycraft;

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  email      VARCHAR(180) UNIQUE NOT NULL,
  password   VARCHAR(255) NOT NULL,
  role       ENUM('admin','creator','respondent') DEFAULT 'respondent',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Forms ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forms (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  creator_id  INT NOT NULL,
  status      ENUM('draft','active','closed') DEFAULT 'draft',
  is_template TINYINT(1) DEFAULT 0,
  template_category VARCHAR(80) DEFAULT NULL,
  due_date    DATE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Form Assignments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_assignments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  form_id     INT NOT NULL,
  user_id     INT NOT NULL,
  status      ENUM('not_started','in_progress','review','attention','completed') DEFAULT 'not_started',
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_assignment (form_id, user_id)
);

-- ── Sections ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sections (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  form_id     INT NOT NULL,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  position    INT DEFAULT 0,
  FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
);

-- ── Questions ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  section_id    INT NOT NULL,
  question_text TEXT NOT NULL,
  question_type ENUM('short_text','long_text','single_choice','multiple_choice','rating','date') NOT NULL,
  options       JSON,
  is_required   TINYINT(1) DEFAULT 0,
  position      INT DEFAULT 0,
  logic         JSON,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
);

-- ── Responses ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS responses (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  form_id      INT NOT NULL,
  user_id      INT NOT NULL,
  status       ENUM('submitted','returned','resubmitted','reviewed') DEFAULT 'submitted',
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Answers ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS answers (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  response_id  INT NOT NULL,
  question_id  INT NOT NULL,
  answer_value JSON,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (response_id) REFERENCES responses(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- ── Activity Logs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  form_id     INT,
  response_id INT,
  user_id     INT NOT NULL,
  action      VARCHAR(120) NOT NULL,
  note        TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── System Templates (shared by all creators) ────────────────────────────────
CREATE TABLE IF NOT EXISTS system_templates (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  category    VARCHAR(80),
  icon        VARCHAR(10) DEFAULT '📋',
  sections    JSON NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ══════════════════════════════════════════════════════════════════════════════
--  SEED: System Templates (10 rich templates)
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO system_templates (title, description, category, icon, sections) VALUES

-- 1. Employee Satisfaction Survey
('Employee Satisfaction Survey',
 'Measure employee engagement, work-life balance, and overall job satisfaction.',
 'HR',  '😊',
 '[
   {"title":"Work-Life Balance","description":"Feedback on your daily schedule and general atmosphere.",
    "questions":[
      {"question_text":"On a scale of 1–5, how would you rate your current work-life balance?","question_type":"rating","options":[],"is_required":true},
      {"question_text":"Which of these benefits do you find most valuable?","question_type":"multiple_choice","options":["Flexible working hours","Health insurance","Professional development budget","Gym membership","Paid time off"],"is_required":false},
      {"question_text":"Briefly describe the one thing you enjoy most about our company culture.","question_type":"long_text","options":[],"is_required":true}
    ]},
   {"title":"Management & Growth","description":"Evaluation of leadership and career progression opportunities.",
    "questions":[
      {"question_text":"I feel that my manager provides me with the support I need to succeed.","question_type":"single_choice","options":["Strongly Agree","Agree","Neutral","Disagree","Strongly Disagree"],"is_required":true},
      {"question_text":"When was the last time you received a formal performance review?","question_type":"date","options":[],"is_required":false},
      {"question_text":"Please provide any specific suggestions on how management can improve communication across the department.","question_type":"long_text","options":[],"is_required":true}
    ]}
 ]'),

-- 2. Patient Health Information
('Patient Health Information Form',
 'Collect essential patient health data to ensure accurate medical records and personalized care.',
 'Healthcare', '🏥',
 '[
   {"title":"Personal & Demographic Information","description":"",
    "questions":[
      {"question_text":"Full Name","question_type":"short_text","options":[],"is_required":true},
      {"question_text":"Date of Birth","question_type":"date","options":[],"is_required":true},
      {"question_text":"Gender","question_type":"single_choice","options":["Male","Female","Non-binary","Prefer not to say"],"is_required":true}
    ]},
   {"title":"Medical History","description":"",
    "questions":[
      {"question_text":"Have you been diagnosed with any of the following?","question_type":"multiple_choice","options":["Diabetes","Hypertension","Asthma","Heart Disease","None"],"is_required":true},
      {"question_text":"Please describe any previous surgeries or major medical procedures.","question_type":"long_text","options":[],"is_required":false},
      {"question_text":"Are you currently taking any prescribed medications?","question_type":"single_choice","options":["Yes","No"],"is_required":true}
    ]},
   {"title":"Lifestyle & Wellness","description":"",
    "questions":[
      {"question_text":"How would you rate your general physical health?","question_type":"rating","options":[],"is_required":true},
      {"question_text":"How often do you participate in physical exercise per week?","question_type":"single_choice","options":["Never","1–2 times","3–4 times","5+ times"],"is_required":true},
      {"question_text":"Briefly describe your dietary habits.","question_type":"long_text","options":[],"is_required":false}
    ]}
 ]'),

-- 3. Student Course Feedback
('Student Course Feedback',
 'Gather student opinions on course content, teaching quality, and learning outcomes.',
 'Education', '🎓',
 '[
   {"title":"Course Content","description":"Rate the quality and relevance of course material.",
    "questions":[
      {"question_text":"Overall, how would you rate this course?","question_type":"rating","options":[],"is_required":true},
      {"question_text":"The course content was well-organized and easy to follow.","question_type":"single_choice","options":["Strongly Agree","Agree","Neutral","Disagree","Strongly Disagree"],"is_required":true},
      {"question_text":"Which topics did you find most useful?","question_type":"multiple_choice","options":["Introduction & Fundamentals","Practical Exercises","Case Studies","Group Projects","Assessments"],"is_required":false}
    ]},
   {"title":"Instructor & Delivery","description":"",
    "questions":[
      {"question_text":"How would you rate the instructor''s teaching effectiveness?","question_type":"rating","options":[],"is_required":true},
      {"question_text":"The instructor was available and responsive to student questions.","question_type":"single_choice","options":["Always","Most of the time","Sometimes","Rarely","Never"],"is_required":true},
      {"question_text":"What improvements would you suggest for this course?","question_type":"long_text","options":[],"is_required":true}
    ]}
 ]'),

-- 4. Event Registration Form
('Event Registration Form',
 'Collect attendee information and preferences for your upcoming event.',
 'Events', '🎪',
 '[
   {"title":"Attendee Information","description":"",
    "questions":[
      {"question_text":"Full Name","question_type":"short_text","options":[],"is_required":true},
      {"question_text":"Email Address","question_type":"short_text","options":[],"is_required":true},
      {"question_text":"Phone Number","question_type":"short_text","options":[],"is_required":false},
      {"question_text":"Date of Attendance","question_type":"date","options":[],"is_required":true}
    ]},
   {"title":"Session Preferences","description":"Help us plan the best experience for you.",
    "questions":[
      {"question_text":"Which sessions are you interested in attending?","question_type":"multiple_choice","options":["Opening Keynote","Technical Workshop","Panel Discussion","Networking Lunch","Product Demo","Closing Ceremony"],"is_required":true},
      {"question_text":"Do you have any dietary restrictions or special requirements?","question_type":"single_choice","options":["None","Vegetarian","Vegan","Gluten-free","Halal","Other"],"is_required":false},
      {"question_text":"How did you hear about this event?","question_type":"single_choice","options":["Email Newsletter","Social Media","Colleague Referral","Company Website","Advertisement"],"is_required":false}
    ]}
 ]'),

-- 5. Product Feedback Survey
('Product Feedback Survey',
 'Understand how customers use your product and identify improvement opportunities.',
 'Business', '📦',
 '[
   {"title":"Product Experience","description":"",
    "questions":[
      {"question_text":"How long have you been using our product?","question_type":"single_choice","options":["Less than 1 month","1–6 months","6–12 months","More than 1 year"],"is_required":true},
      {"question_text":"Overall, how satisfied are you with our product?","question_type":"rating","options":[],"is_required":true},
      {"question_text":"Which features do you use most frequently?","question_type":"multiple_choice","options":["Dashboard","Reports & Analytics","Notifications","Integrations","Mobile App","API Access"],"is_required":false}
    ]},
   {"title":"Improvement & NPS","description":"",
    "questions":[
      {"question_text":"How likely are you to recommend our product to a friend or colleague? (1=Not likely, 5=Very likely)","question_type":"rating","options":[],"is_required":true},
      {"question_text":"What is the biggest challenge you face when using our product?","question_type":"long_text","options":[],"is_required":true},
      {"question_text":"What new feature would make the biggest positive impact for you?","question_type":"long_text","options":[],"is_required":false}
    ]}
 ]'),

-- 6. IT Incident Report
('IT Incident Report',
 'Document technical issues, system failures, and IT support requests.',
 'IT', '💻',
 '[
   {"title":"Incident Details","description":"",
    "questions":[
      {"question_text":"Your Full Name","question_type":"short_text","options":[],"is_required":true},
      {"question_text":"Department","question_type":"short_text","options":[],"is_required":true},
      {"question_text":"Date the issue occurred","question_type":"date","options":[],"is_required":true},
      {"question_text":"Category of issue","question_type":"single_choice","options":["Hardware Failure","Software Bug","Network Connectivity","Security Incident","Login/Access Issue","Other"],"is_required":true}
    ]},
   {"title":"Issue Description","description":"",
    "questions":[
      {"question_text":"Severity of the incident","question_type":"single_choice","options":["Critical – System Down","High – Major Function Unavailable","Medium – Minor Impact","Low – Cosmetic Issue"],"is_required":true},
      {"question_text":"Please describe the issue in detail including error messages if any.","question_type":"long_text","options":[],"is_required":true},
      {"question_text":"Have you already attempted any troubleshooting steps?","question_type":"single_choice","options":["Yes","No"],"is_required":true},
      {"question_text":"If yes, describe what you tried.","question_type":"long_text","options":[],"is_required":false}
    ]}
 ]'),

-- 7. Job Application Form
('Job Application Form',
 'Streamlined application form to collect candidate details and qualifications.',
 'HR', '💼',
 '[
   {"title":"Personal Information","description":"",
    "questions":[
      {"question_text":"Full Name","question_type":"short_text","options":[],"is_required":true},
      {"question_text":"Email Address","question_type":"short_text","options":[],"is_required":true},
      {"question_text":"Phone Number","question_type":"short_text","options":[],"is_required":true},
      {"question_text":"Position Applied For","question_type":"short_text","options":[],"is_required":true}
    ]},
   {"title":"Professional Background","description":"",
    "questions":[
      {"question_text":"What is your highest level of education?","question_type":"single_choice","options":["High School Diploma","Associate Degree","Bachelor''s Degree","Master''s Degree","Doctorate","Professional Certification"],"is_required":true},
      {"question_text":"Total years of relevant work experience","question_type":"single_choice","options":["0–1 years","2–3 years","4–6 years","7–10 years","10+ years"],"is_required":true},
      {"question_text":"Please briefly describe your most relevant work experience.","question_type":"long_text","options":[],"is_required":true}
    ]},
   {"title":"Availability & Fit","description":"",
    "questions":[
      {"question_text":"What is your earliest available start date?","question_type":"date","options":[],"is_required":true},
      {"question_text":"Why are you interested in joining our organization?","question_type":"long_text","options":[],"is_required":true}
    ]}
 ]'),

-- 8. Customer Support Satisfaction
('Customer Support Satisfaction',
 'Measure the quality of your customer support interactions.',
 'Business', '🎧',
 '[
   {"title":"Support Interaction","description":"",
    "questions":[
      {"question_text":"How did you contact our support team?","question_type":"single_choice","options":["Live Chat","Email","Phone","Help Center Article","Social Media"],"is_required":true},
      {"question_text":"How quickly was your issue resolved?","question_type":"single_choice","options":["Same day","Within 24 hours","2–3 days","More than 3 days","Not yet resolved"],"is_required":true},
      {"question_text":"Overall satisfaction with the support you received","question_type":"rating","options":[],"is_required":true}
    ]},
   {"title":"Agent & Resolution Quality","description":"",
    "questions":[
      {"question_text":"The support agent was knowledgeable and helpful.","question_type":"single_choice","options":["Strongly Agree","Agree","Neutral","Disagree","Strongly Disagree"],"is_required":true},
      {"question_text":"Was your issue fully resolved?","question_type":"single_choice","options":["Yes, completely","Partially","No"],"is_required":true},
      {"question_text":"Any additional comments or suggestions for our support team?","question_type":"long_text","options":[],"is_required":false}
    ]}
 ]'),

-- 9. Project Kickoff Checklist
('Project Kickoff Checklist',
 'Ensure all key project details are captured before a project begins.',
 'Business', '🚀',
 '[
   {"title":"Project Overview","description":"",
    "questions":[
      {"question_text":"Project Name","question_type":"short_text","options":[],"is_required":true},
      {"question_text":"Project Manager Name","question_type":"short_text","options":[],"is_required":true},
      {"question_text":"Estimated Project Start Date","question_type":"date","options":[],"is_required":true},
      {"question_text":"Estimated Project End Date","question_type":"date","options":[],"is_required":true}
    ]},
   {"title":"Scope & Requirements","description":"",
    "questions":[
      {"question_text":"Project priority level","question_type":"single_choice","options":["Critical","High","Medium","Low"],"is_required":true},
      {"question_text":"Key deliverables for this project (list each one)","question_type":"long_text","options":[],"is_required":true},
      {"question_text":"What are the known risks or blockers?","question_type":"long_text","options":[],"is_required":true},
      {"question_text":"Which departments are involved?","question_type":"multiple_choice","options":["Engineering","Design","Marketing","Sales","Finance","Legal","HR","Operations"],"is_required":false}
    ]}
 ]'),

-- 10. Training Needs Assessment
('Training Needs Assessment',
 'Identify skill gaps and training priorities across your team.',
 'HR', '📚',
 '[
   {"title":"Current Skills Self-Assessment","description":"Rate your proficiency in key areas.",
    "questions":[
      {"question_text":"Your role/job title","question_type":"short_text","options":[],"is_required":true},
      {"question_text":"How would you rate your current technical skills relevant to your role?","question_type":"rating","options":[],"is_required":true},
      {"question_text":"In which skill areas do you feel you need the most development?","question_type":"multiple_choice","options":["Leadership & Management","Technical / Hard Skills","Communication","Data Analysis","Project Management","Customer Relations","Digital Tools","Compliance & Legal"],"is_required":true}
    ]},
   {"title":"Training Preferences","description":"",
    "questions":[
      {"question_text":"What format of training do you prefer?","question_type":"single_choice","options":["In-person workshop","Online self-paced","Live webinar","On-the-job mentoring","Mixed / Blended"],"is_required":true},
      {"question_text":"How many hours per month can you dedicate to training?","question_type":"single_choice","options":["Less than 2 hours","2–5 hours","5–10 hours","10+ hours"],"is_required":true},
      {"question_text":"Describe the most important skill you want to develop this year and why.","question_type":"long_text","options":[],"is_required":true}
    ]}
 ]');

-- ══════════════════════════════════════════════════════════════════════════════
--  SEED: Demo users  (password = "password" for all)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT IGNORE INTO users (name, email, password, role) VALUES
('Super Admin',  'admin@querycraft.com',     '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');

-- ── Password Resets ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_resets (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL UNIQUE,
  token      VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
